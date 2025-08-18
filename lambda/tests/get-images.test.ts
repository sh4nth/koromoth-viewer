import { handler } from '../get-images.js';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock the AWS SDK clients
const s3Mock = mockClient(S3Client);
const ddbMock = mockClient(DynamoDBDocumentClient);

describe('get-images handler', () => {

  beforeEach(() => {
    // Reset mocks before each test
    s3Mock.reset();
    ddbMock.reset();
  });

  it('should list all images when no tags are provided', async () => {
    // Arrange: Mock the DynamoDB ScanCommand
    const mockImages = [
      { ImageKey: 'image1.jpg', ThumbnailUrl: 'http://example.com/thumb1.jpg' },
      { ImageKey: 'image2.png', ThumbnailUrl: 'http://example.com/thumb2.png' },
    ];
    ddbMock.on(ScanCommand).resolves({ Items: mockImages });

    const event: Partial<APIGatewayProxyEvent> = {
      multiValueQueryStringParameters: {}, // No tags
    };

    // Act: Call the handler
    const result = await handler(event as APIGatewayProxyEvent);

    // Assert: Check the result
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.images).toEqual(mockImages);
  });

  it('should return the intersection of images when multiple tags are provided', async () => {
    // Arrange: Mock the DynamoDB QueryCommand for each tag
    ddbMock.on(QueryCommand, {
      TableName: process.env.TAG_IMAGES_TABLE_NAME,
      KeyConditionExpression: 'Tag = :t',
      ExpressionAttributeValues: { ':t': 'sunset' },
    }).resolves({
      Items: [{ ImageKey: 'photo1.jpg' }, { ImageKey: 'photo2.jpg' }],
    });

    ddbMock.on(QueryCommand, {
      TableName: process.env.TAG_IMAGES_TABLE_NAME,
      KeyConditionExpression: 'Tag = :t',
      ExpressionAttributeValues: { ':t': 'beach' },
    }).resolves({
      Items: [{ ImageKey: 'photo2.jpg' }, { ImageKey: 'photo3.jpg' }],
    });

    const event: Partial<APIGatewayProxyEvent> = {
      multiValueQueryStringParameters: {
        tag: ['sunset', 'beach'],
      },
    };

    // Act: Call the handler
    const result = await handler(event as APIGatewayProxyEvent);

    // Assert: Check the result
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    // The result should be the intersection of the two sets: ['photo2.jpg']
    expect(body.imageKeys).toEqual(['photo2.jpg']);
    expect(body.tags).toEqual(['sunset', 'beach']);
  });

  it('should return an empty array if no images match all tags', async () => {
    // Arrange
    ddbMock.on(QueryCommand, {
        ExpressionAttributeValues: { ':t': 'sunset' },
    }).resolves({
      Items: [{ ImageKey: 'photo1.jpg' }],
    });

    ddbMock.on(QueryCommand, {
        ExpressionAttributeValues: { ':t': 'mountain' },
    }).resolves({
      Items: [{ ImageKey: 'photo2.jpg' }],
    });

    const event: Partial<APIGatewayProxyEvent> = {
      multiValueQueryStringParameters: {
        tag: ['sunset', 'mountain'],
      },
    };

    // Act
    const result = await handler(event as APIGatewayProxyEvent);

    // Assert
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.imageKeys).toEqual([]);
  });
});

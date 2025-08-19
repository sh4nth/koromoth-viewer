import { handler } from '../get-images.js';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  BatchGetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent } from 'aws-lambda';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('get-images handler', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it('should list all images when no tags are provided', async () => {
    const mockImages = [mockImage('image1.jpg'), mockImage('image2.png')];
    mockImageThumbnailProjection(ddbMock, mockImages);

    const event: Partial<APIGatewayProxyEvent> = {};
    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.images).toEqual(mockImages);
  });

  it('should return the intersection of images when multiple tags are provided', async () => {
    // Arrange
    mockTagQueryResults(ddbMock, 'sunset', ['only-sunset.jpg', 'beach-sunset.jpg']);
    mockTagQueryResults(ddbMock, 'beach', ['beach-sunset.jpg', 'only-beach.jpg']);

    const mockImageData = mockImage('beach-sunset.jpg');
    mockImageThumbnailBatchGet(ddbMock, [mockImageData]);

    const event: Partial<APIGatewayProxyEvent> = {
      multiValueQueryStringParameters: {
        tag: ['sunset', 'beach'],
      },
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.images).toEqual([mockImageData]);
  });

  it('should return an empty array if no images match all tags', async () => {
    // Arrange
    mockTagQueryResults(ddbMock, 'sunset', ['photo1.jpg']);
    mockTagQueryResults(ddbMock, 'mountain', ['photo2.jpg']);
    mockImageThumbnailBatchGet(ddbMock, []); // BatchGet will be called with no keys

    const event: Partial<APIGatewayProxyEvent> = {
      multiValueQueryStringParameters: {
        tag: ['sunset', 'mountain'],
      },
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.images).toEqual([]);
  });
});

// ##############################################################################
// # Helper Functions
// ##############################################################################

const mockImage = (name: string) => ({
  ImageKey: name,
  ThumbnailUrl: `https://thumbnails-r-us.com/${name}`,
});

const mockTagQueryResults = (
  mock: typeof ddbMock,
  tag: string,
  imageKeys: string[],
) => {
  mock
    .on(QueryCommand, {
      TableName: process.env.TAG_IMAGES_TABLE_NAME,
      KeyConditionExpression: 'Tag = :t',
      ExpressionAttributeValues: { ':t': tag },
    })
    .resolves({
      Items: imageKeys.map((key) => ({ ImageKey: key })),
    });
};

const mockImageThumbnailBatchGet = (
  mock: typeof ddbMock,
  images: { ImageKey: string; ThumbnailUrl: string }[],
) => {
  mock.on(BatchGetCommand).resolves({
    Responses: {
      [process.env.IMAGE_TAGS_TABLE_NAME as string]: images,
    },
  });
};

const mockImageThumbnailProjection = (
  mock: typeof ddbMock,
  images: { ImageKey: string; ThumbnailUrl: string }[],
) => {
  mock.on(QueryCommand).resolves({ Items: images });
};

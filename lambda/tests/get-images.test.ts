import { handler, encodeNextPageToken, decodeNextPageToken } from '../get-images.js';
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
    mockImageTagsTable(ddbMock, mockImages);

    const event: Partial<APIGatewayProxyEvent> = {
      requestContext: {} as APIGatewayProxyEvent['requestContext'],
    };
    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.images).toEqual(mockImages);
  });

  it('should respect pagesize in list all images', async () => {
    mockImageTagsTable(ddbMock, zeroTo20Images);

    const event: Partial<APIGatewayProxyEvent> = {
      queryStringParameters: {
        pageSize: '5',
      },
      requestContext: {} as APIGatewayProxyEvent['requestContext'],
    };
    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.images).toEqual(zeroTo20Images.slice(0, 5));
    expect(body.nextPageToken).toEqual(encodeNextPageToken('04.jpg'));
  });

  it('should handle nextPageToken correctly', async () => {
    mockImageTagsTable(ddbMock, zeroTo20Images);

    const event: Partial<APIGatewayProxyEvent> = {
      queryStringParameters: {
        pageSize: '5',
        nextPageToken: encodeNextPageToken('05.jpg'),
      },
      requestContext: {} as APIGatewayProxyEvent['requestContext'],
    };
    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.images).toEqual(zeroTo20Images.slice(6, 11));
    expect(body.nextPageToken).toEqual(encodeNextPageToken('10.jpg'));
  });

  it('should handle paging correctly when using tags', async () => {
    mockImageTagsTable(ddbMock, zeroTo20Images);
    mockTagImagesTable(ddbMock, 'evens', [
      ...zeroTo20Images.filter((_, i) => i % 2 === 0).map((image) => image.ImageKey),
    ]);
    mockTagImagesTable(ddbMock, 'multiplesOfThree', [
      ...zeroTo20Images.filter((_, i) => i % 3 === 0).map((image) => image.ImageKey),
    ]);

    const event: Partial<APIGatewayProxyEvent> = {
      queryStringParameters: {
        pageSize: '3',
        nextPageToken: encodeNextPageToken('04.jpg'),
      },
      multiValueQueryStringParameters: {
        tag: ['evens', 'multiplesOfThree'],
      },
      requestContext: {} as APIGatewayProxyEvent['requestContext'],
    };
    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.images).toEqual([
      zeroTo20Images[6],
      zeroTo20Images[12],
      zeroTo20Images[18],
    ]);
    expect(decodeNextPageToken(body.nextPageToken)).toEqual('18.jpg');
  });

  it('should return the intersection of images when multiple tags are provided', async () => {
    // Arrange
    mockTagImagesTable(ddbMock, 'sunset', ['only-sunset.jpg', 'beach-sunset.jpg']);
    mockTagImagesTable(ddbMock, 'beach', ['beach-sunset.jpg', 'only-beach.jpg']);

    const mockImageData = mockImage('beach-sunset.jpg');
    mockImageTagsTable(ddbMock, [mockImageData]);

    const event: Partial<APIGatewayProxyEvent> = {
      multiValueQueryStringParameters: {
        tag: ['sunset', 'beach'],
      },
      requestContext: {} as APIGatewayProxyEvent['requestContext'],
    };

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.images).toEqual([mockImageData]);
  });

  it('should return an empty array if no images match all tags', async () => {
    // Arrange
    mockTagImagesTable(ddbMock, 'sunset', ['photo1.jpg']);
    mockTagImagesTable(ddbMock, 'mountain', ['photo2.jpg']);
    mockImageTagsTable(ddbMock, []); // BatchGet will be called with no keys

    const event: Partial<APIGatewayProxyEvent> = {
      multiValueQueryStringParameters: {
        tag: ['sunset', 'mountain'],
      },
      requestContext: {} as APIGatewayProxyEvent['requestContext'],
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

const zeroTo20Images = Array.from({ length: 20 }, (_, i) =>
  mockImage(`${i.toString().padStart(2, '0')}.jpg`),
);

const mockTagImagesTable = (mock: typeof ddbMock, tag: string, imageKeys: string[]) => {
  mock
    .on(QueryCommand, {
      TableName: process.env.TAG_IMAGES_TABLE_NAME,
      KeyConditionExpression: 'Tag = :t',
      ExpressionAttributeValues: { ':t': tag },
    })
    .callsFake((request) => {
      const startKey = request.ExclusiveStartKey?.ImageKey;
      const limit = request.Limit;
      const items = [...imageKeys.filter((key) => !startKey || key > startKey)].slice(
        0,
        limit || imageKeys.length,
      );
      const lastEvaluatedKey =
        items.length > 0 ? { ImageKey: items[items.length - 1] } : undefined;
      return {
        Items: items.map((key) => ({ ImageKey: key })),
        LastEvaluatedKey: lastEvaluatedKey,
      };
    });
};

const mockImageTagsTable = (
  mock: typeof ddbMock,
  images: { ImageKey: string; ThumbnailUrl: string }[],
) => {
  mock.on(BatchGetCommand).callsFake((command) => {
    const tableName = process.env.IMAGE_TAGS_TABLE_NAME as string;
    const requestItems = command.RequestItems;
    if (requestItems && requestItems[tableName]) {
      const keys = requestItems[tableName].Keys || [];
      // Call your custom fake function with keys
      const fakeImages = images.filter((image) =>
        keys.some((key: { ImageKey: string }) => key.ImageKey === image.ImageKey),
      );
      return {
        Responses: {
          [tableName]: fakeImages,
        },
      };
    }
    // If IMAGE_TAGS_TABLE_NAME is not present, return empty response
    throw new Error(
      `BatchGetCommand only expected for IMAGE_TAGS_TABLE_NAME but got ${tableName}.`,
    );
  });
  mock
    .on(QueryCommand, {
      TableName: process.env.IMAGE_TAGS_TABLE_NAME,
      ProjectionExpression: 'ImageKey, ThumbnailUrl',
    })
    .callsFake((request) => {
      const startKey = request.ExclusiveStartKey?.ImageKey;
      const limit = request.Limit;
      const items = [
        ...images.filter((image) => !startKey || image.ImageKey > startKey),
      ].slice(0, limit || images.length);
      const lastEvaluatedKey =
        items.length > 0 ? { ImageKey: items[items.length - 1].ImageKey } : undefined;
      return {
        Items: items,
        LastEvaluatedKey: lastEvaluatedKey,
      };
      // Simulate a response with the provided images
    });
};

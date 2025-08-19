import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiResponse } from './utils/response.js';

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const IMAGE_TAGS_TABLE_NAME = process.env.IMAGE_TAGS_TABLE_NAME;
const TAG_IMAGES_TABLE_NAME = process.env.TAG_IMAGES_TABLE_NAME;

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const tags = event.multiValueQueryStringParameters?.tag;

    if (tags) {
      return getImagesByTags(tags);
    } else {
      return listAllImages();
    }
  } catch (error) {
    return ApiResponse.serverError(error);
  }
};

const getImagesByTags = async (tags: string[]): Promise<APIGatewayProxyResult> => {
  // 1. Query the inverted index to get image keys for each tag
  const queryPromises = tags.map((tag) => {
    const queryCommand = new QueryCommand({
      TableName: TAG_IMAGES_TABLE_NAME,
      KeyConditionExpression: 'Tag = :t',
      ExpressionAttributeValues: { ':t': tag },
    });
    return ddbDocClient.send(queryCommand);
  });

  const queryResults = await Promise.all(queryPromises);

  // 2. Find the intersection of image keys
  const imageKeySets = queryResults.map(
    (result) => new Set(result.Items ? result.Items.map((item) => item.ImageKey) : []),
  );

  const intersection =
    imageKeySets.length > 0
      ? imageKeySets.reduce(
          (acc, currentSet) =>
            new Set([...acc].filter((imageKey) => currentSet.has(imageKey))),
        )
      : new Set();

  const imageKeys = [...intersection];

  if (imageKeys.length === 0) {
    return ApiResponse.success({
      tags: tags,
      images: [],
    });
  }

  // 3. Fetch the ThumbnailUrl for each image key from the main table
  const batchGetCommand = new BatchGetCommand({
    RequestItems: {
      [IMAGE_TAGS_TABLE_NAME as string]: {
        Keys: imageKeys.map((key) => ({ ImageKey: key })),
        ProjectionExpression: 'ImageKey, ThumbnailUrl',
      },
    },
  });

  const { Responses } = await ddbDocClient.send(batchGetCommand);
  const images = Responses ? Responses[IMAGE_TAGS_TABLE_NAME as string] : [];

  return ApiResponse.success({
    tags: tags,
    images: images,
  });
};

const listAllImages = async (): Promise<APIGatewayProxyResult> => {
  const scanCommand = new ScanCommand({
    TableName: IMAGE_TAGS_TABLE_NAME,
    ProjectionExpression: 'ImageKey, ThumbnailUrl',
  });

  const { Items } = await ddbDocClient.send(scanCommand);

  return ApiResponse.success({
    images: Items || [],
  });
};

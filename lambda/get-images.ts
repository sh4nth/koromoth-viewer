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
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

interface ImageKeysResult {
  imageKeys: string[];
  nextCursor: string | null;
}

export const handler = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  try {
    const tags = event.multiValueQueryStringParameters?.tag;
    const nextToken = event.queryStringParameters?.nextToken;

    let pageSize = DEFAULT_PAGE_SIZE;
    if (event.queryStringParameters?.pageSize) {
      const requestedSize = parseInt(event.queryStringParameters.pageSize, 10);
      if (!isNaN(requestedSize) && requestedSize > 0) {
        pageSize = Math.min(requestedSize, MAX_PAGE_SIZE);
      }
    }

    if (tags) {
      return getImagesByTags(tags, pageSize, nextToken);
    } else {
      return listAllImages();
    }
  } catch (error) {
    return ApiResponse.serverError(error);
  }
};

async function getImageKeys(
  tags: string[],
  startKey: string | undefined,
  pageSize: number,
): Promise<ImageKeysResult> {
  // 1. Query each tag for its list of images, starting from the cursor.
  const queryPromises = tags.map((tag) => {
    const queryCommand = new QueryCommand({
      TableName: TAG_IMAGES_TABLE_NAME,
      KeyConditionExpression: 'Tag = :t',
      ExpressionAttributeValues: { ':t': tag },
      Limit: pageSize,
      ExclusiveStartKey: startKey ? { Tag: tag, ImageKey: startKey } : undefined,
    });
    return ddbDocClient.send(queryCommand);
  });

  const queryResults = await Promise.all(queryPromises);

  // 2. Determine the cursor for the *next* page.
  const lastKeys: string[] = [];
  let allQueriesHaveMoreResults = true;

  for (const result of queryResults) {
    if (result.LastEvaluatedKey?.ImageKey) {
      lastKeys.push(result.LastEvaluatedKey.ImageKey);
    } else {
      allQueriesHaveMoreResults = false;
      break;
    }
  }

  let nextCursor: string | null = null;
  if (allQueriesHaveMoreResults && lastKeys.length > 0) {
    nextCursor = lastKeys.reduce((min, current) => (current < min ? current : min));
  }

  // 3. Calculate the intersection of image keys for the current page.
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

  return {
    imageKeys: [...intersection],
    nextCursor,
  };
}

const getImagesByTags = async (
  tags: string[],
  pageSize: number,
  nextToken?: string,
): Promise<APIGatewayProxyResult> => {
  const startKey = nextToken
    ? JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'))
    : undefined;

  const { imageKeys, nextCursor } = await getImageKeys(tags, startKey, pageSize);

  const nextPageToken = Buffer.from(JSON.stringify(nextCursor)).toString('base64');

  if (imageKeys.length === 0) {
    return ApiResponse.success({ images: [], nextPageToken });
  }

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

  return ApiResponse.success({ tags, images, nextPageToken });
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

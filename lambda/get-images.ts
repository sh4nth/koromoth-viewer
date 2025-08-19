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
    const nextPageToken = event.queryStringParameters?.nextPageToken;

    const pageSize = getPageSize(event.queryStringParameters?.pageSize);

    if (tags) {
      return getImagesByTags(tags, pageSize, nextPageToken);
    } else {
      return listAllImages();
    }
  } catch (error) {
    return ApiResponse.serverError(error);
  }
};

function getPageSize(pageSizeQueryParam: string | undefined) {
  if (!pageSizeQueryParam) {
    return DEFAULT_PAGE_SIZE;
  }
  const requestedSize = parseInt(pageSizeQueryParam, 10);
  if (!isNaN(requestedSize) && requestedSize > 0) {
    return Math.min(requestedSize, MAX_PAGE_SIZE);
  }
  return DEFAULT_PAGE_SIZE;
}

async function getImageKeys(
  tags: string[],
  startKey: string | undefined,
  pageSize: number,
): Promise<ImageKeysResult> {
  const limitPerTag = tags.length > 1 ? 2 * pageSize : pageSize;
  // 1. Query each tag for its list of images, starting from the cursor.
  const queryPromises = tags.map((tag) => {
    const queryCommand = new QueryCommand({
      TableName: TAG_IMAGES_TABLE_NAME,
      KeyConditionExpression: 'Tag = :t',
      ExpressionAttributeValues: { ':t': tag },
      Limit: limitPerTag,
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
    imageKeys: [...intersection].sort(),
    nextCursor,
  };
}

const getImagesByTags = async (
  tags: string[],
  pageSize: number,
  nextToken?: string,
): Promise<APIGatewayProxyResult> => {
  let nextCursor = nextToken
    ? JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'))
    : undefined;
  const allImageKeys: string[] = [];

  while (allImageKeys.length < pageSize) {
    const result = await getImageKeys(tags, nextCursor, pageSize);
    allImageKeys.push(...result.imageKeys);
    nextCursor = result.nextCursor;

    if (!nextCursor) {
      // No more items to fetch from the source
      break;
    }
  }

  let finalImageKeys = allImageKeys;
  if (allImageKeys.length > pageSize) {
    finalImageKeys = allImageKeys.slice(0, pageSize);
    // The next token should point to the first item of the *next* page.
    nextCursor = allImageKeys[pageSize];
  }

  const nextPageToken = nextCursor
    ? Buffer.from(JSON.stringify(nextCursor)).toString('base64')
    : null;

  if (finalImageKeys.length === 0) {
    return ApiResponse.success({ images: [], nextPageToken });
  }

  const batchGetCommand = new BatchGetCommand({
    RequestItems: {
      [IMAGE_TAGS_TABLE_NAME as string]: {
        Keys: finalImageKeys.map((key) => ({ ImageKey: key })),
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

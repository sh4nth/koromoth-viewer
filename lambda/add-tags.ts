import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  BatchWriteCommand,
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
    const imageKey = event.pathParameters?.key;
    if (!imageKey) {
      return ApiResponse.badRequest('Missing image key in path.');
    }

    if (!event.body) {
      return ApiResponse.badRequest('Missing request body.');
    }

    const { tags } = JSON.parse(event.body);
    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return ApiResponse.badRequest(
        "Missing or invalid 'tags' in request body. Expecting a JSON array of strings.",
      );
    }

    const updateImageTagsCommand = new UpdateCommand({
      TableName: IMAGE_TAGS_TABLE_NAME,
      Key: { ImageKey: imageKey },
      UpdateExpression: 'ADD Tags :t',
      ExpressionAttributeValues: {
        ':t': new Set(tags),
      },
    });

    const putRequests = tags.map((tag) => ({
      PutRequest: {
        Item: { Tag: tag, ImageKey: imageKey },
      },
    }));

    const batchWriteCommand = new BatchWriteCommand({
      RequestItems: {
        [TAG_IMAGES_TABLE_NAME as string]: putRequests,
      },
    });

    await Promise.all([
      ddbDocClient.send(updateImageTagsCommand),
      ddbDocClient.send(batchWriteCommand),
    ]);

    return ApiResponse.success({
      message: `Successfully added tags to ${imageKey}`,
    });
  } catch (error) {
    return ApiResponse.serverError(error);
  }
};

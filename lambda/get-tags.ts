import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ApiResponse } from './utils/response.js';

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const IMAGE_TAGS_TABLE_NAME = process.env.IMAGE_TAGS_TABLE_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const imageKey = event.pathParameters?.key;
        if (!imageKey) {
            return ApiResponse.badRequest("Missing image key in path.");
        }

        const getTagsCommand = new GetCommand({
            TableName: IMAGE_TAGS_TABLE_NAME,
            Key: { ImageKey: imageKey },
        });

        const { Item } = await ddbDocClient.send(getTagsCommand);
        const tags = Item?.Tags ? Array.from(Item.Tags) : [];

        return ApiResponse.success({
            imageKey: imageKey,
            tags: tags,
        });
    } catch (error) {
        return ApiResponse.serverError(error);
    }
};

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const IMAGE_TAGS_TABLE_NAME = process.env.IMAGE_TAGS_TABLE_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Received event:", JSON.stringify(event, null, 2));

        const imageKey = event.pathParameters?.key;
        if (!imageKey) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Missing image key in path." }),
            };
        }

        const getTagsCommand = new GetCommand({
            TableName: IMAGE_TAGS_TABLE_NAME,
            Key: { ImageKey: imageKey },
        });

        const { Item } = await ddbDocClient.send(getTagsCommand);

        const tags = Item?.Tags ? Array.from(Item.Tags) : [];

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                imageKey: imageKey,
                tags: tags,
            }),
        };
    } catch (error) {
        console.error("Error getting tags:", error);
        const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred';
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ message: 'Failed to get tags.', error: errorMessage }),
        };
    }
};

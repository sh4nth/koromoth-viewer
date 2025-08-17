import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const TAG_IMAGES_TABLE_NAME = process.env.TAG_IMAGES_TABLE_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        console.log("Received event:", JSON.stringify(event, null, 2));

        const tag = event.pathParameters?.tag;
        if (!tag) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Missing tag in path." }),
            };
        }

        const queryCommand = new QueryCommand({
            TableName: TAG_IMAGES_TABLE_NAME,
            KeyConditionExpression: "Tag = :t",
            ExpressionAttributeValues: {
                ":t": tag,
            },
        });

        const { Items } = await dynamoDBClient.send(queryCommand);

        const imageKeys = Items ? Items.map(item => item.ImageKey) : [];

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                tag: tag,
                imageKeys: imageKeys,
            }),
        };
    } catch (error) {
        console.error("Error getting images by tag:", error);
        const errorMessage = (error instanceof Error) ? error.message : 'An unknown error occurred';
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ message: 'Failed to get images by tag.', error: errorMessage }),
        };
    }
};

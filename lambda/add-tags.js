import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { UpdateCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const dynamoDBClient = new DynamoDBClient({ region: process.env.AWS_REGION });

const IMAGE_TAGS_TABLE_NAME = process.env.IMAGE_TAGS_TABLE_NAME;
const TAG_IMAGES_TABLE_NAME = process.env.TAG_IMAGES_TABLE_NAME;

export const handler = async (event) => {
    try {
        console.log("Received event:", JSON.stringify(event, null, 2));

        const imageKey = event.pathParameters?.key;
        if (!imageKey) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Missing image key in path." }),
            };
        }

        const { tags } = JSON.parse(event.body);
        if (!tags || !Array.isArray(tags) || tags.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: "Missing or invalid 'tags' in request body. Expecting a JSON array of strings." }),
            };
        }

        // 1. Update the ImageTagsTable to add the new tags to the set
        const updateImageTagsCommand = new UpdateCommand({
            TableName: IMAGE_TAGS_TABLE_NAME,
            Key: { ImageKey: imageKey },
            UpdateExpression: "ADD Tags :t",
            ExpressionAttributeValues: {
                ":t": new Set(tags),
            },
            ReturnValues: "UPDATED_NEW",
        });

        await dynamoDBClient.send(updateImageTagsCommand);

        // 2. Update the TagImagesTable (inverted index)
        const putRequests = tags.map(tag => ({
            PutRequest: {
                Item: {
                    Tag: tag,
                    ImageKey: imageKey,
                },
            },
        }));

        const batchWriteCommand = new BatchWriteCommand({
            RequestItems: {
                [TAG_IMAGES_TABLE_NAME]: putRequests,
            },
        });

        await dynamoDBClient.send(batchWriteCommand);

        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                message: `Successfully added tags to ${imageKey}`,
            }),
        };
    } catch (error) {
        console.error("Error adding tags:", error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ message: 'Failed to add tags.', error: error.message }),
        };
    }
};

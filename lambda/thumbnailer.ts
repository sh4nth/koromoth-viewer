import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Event } from 'aws-lambda';
import sharp from 'sharp';
import { createHash } from 'crypto';

const s3Client = new S3Client({});
const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const THUMBNAIL_BUCKET_NAME = process.env.THUMBNAIL_BUCKET_NAME;
const IMAGE_TAGS_TABLE_NAME = process.env.IMAGE_TAGS_TABLE_NAME;
const THUMBNAIL_SIZE = 200;

export const handler = async (event: S3Event): Promise<void> => {
  console.log('Received S3 event:', JSON.stringify(event, null, 2));

  for (const record of event.Records) {
    const bucketName = record.s3.bucket.name;
    const imageKey = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    try {
      // 1. Download the image from the source bucket
      const getObjectCommand = new GetObjectCommand({
        Bucket: bucketName,
        Key: imageKey,
      });
      const imageResponse = await s3Client.send(getObjectCommand);
      const imageBody = await imageResponse.Body?.transformToByteArray();
      if (!imageBody) {
        throw new Error(`Could not read image body for ${imageKey}`);
      }

      // 2. Create the thumbnail
      const thumbnailBuffer = await sharp(imageBody)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover' })
        .jpeg({ quality: 80 })
        .toBuffer();

      // 3. Generate a unique, salted hash for the thumbnail filename
      const salt = new Date().toISOString();
      const hash = createHash('sha256').update(imageKey + salt).digest('hex');
      const thumbnailKey = `${hash}.jpg`;

      // 4. Upload the thumbnail to the public bucket
      const putObjectCommand = new PutObjectCommand({
        Bucket: THUMBNAIL_BUCKET_NAME,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/jpeg',
      });
      await s3Client.send(putObjectCommand);

      // 5. Update the DynamoDB table with the thumbnail URL
      const thumbnailUrl = `https://${THUMBNAIL_BUCKET_NAME}.s3.amazonaws.com/${thumbnailKey}`;
      const updateCommand = new UpdateCommand({
        TableName: IMAGE_TAGS_TABLE_NAME,
        Key: { ImageKey: imageKey },
        UpdateExpression: 'SET ThumbnailUrl = :url',
        ExpressionAttributeValues: {
          ':url': thumbnailUrl,
        },
      });
      await ddbDocClient.send(updateCommand);

      console.log(`Successfully created thumbnail for ${imageKey}`);

    } catch (error) {
      console.error(`Error processing ${imageKey}:`, error);
    }
  }
};

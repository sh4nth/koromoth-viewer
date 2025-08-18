# Koromoth Viewer - Lambda Functions

This directory contains the TypeScript source code for all backend Lambda functions.

## API Endpoints

All endpoints are namespaced under the `/api` prefix, which is configured in the API Gateway.

### `GET /api/images`

-   **Handler:** `get-images.ts`
-   **Description:** This is a multi-purpose endpoint for retrieving image keys.
    -   If called with no query parameters, it lists all image keys from the S3 bucket.
    -   If called with one or more `tag` query parameters (e.g., `/api/images?tag=sunset&tag=beach`), it returns a list of image keys that have **all** of the specified tags.

### `GET /api/image/{key}`

-   **Handler:** `get-image.ts`
-   **Description:** Generates and returns a short-lived, presigned URL to securely access a specific image file from the S3 bucket.

### `GET /api/image/{key}/tags`

-   **Handler:** `get-tags.ts`
-   **Description:** Retrieves and returns a list of all tags associated with a specific image key from the `ImageTags` DynamoDB table.

### `POST /api/image/{key}/tags`

-   **Handler:** `add-tags.ts`
-   **Description:** Adds one or more tags to a specific image. The request body should be a JSON object with a `tags` array (e.g., `{"tags": ["new-tag", "another-tag"]}`). This function writes to both the `ImageTags` and `TagImages` DynamoDB tables.

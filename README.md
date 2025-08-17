# Koromoth Viewer

A serverless image gallery application built with the AWS CDK, TypeScript, and React.

## Architecture

This project consists of a serverless backend and a React single-page application frontend.

-   **Frontend**: A React SPA built with Vite and styled with Bootstrap. It is hosted on an **S3 Bucket** and served globally via **Amazon CloudFront**.
-   **Backend API**: An **Amazon API Gateway** proxies requests to the backend logic. All endpoints are namespaced under `/api`.
-   **Compute**: **AWS Lambda** functions written in TypeScript handle all backend logic.
-   **Storage**:
    -   An existing **S3 Bucket** is used to store the original image files.
    -   Two **Amazon DynamoDB** tables are used to store image tags and an inverted index for efficient tag-based lookups.

## Project Setup

### Prerequisites

-   AWS Account and configured AWS CLI
-   Node.js and npm
-   Python and pip
-   AWS CDK Toolkit (`npm install -g aws-cdk`)

### Installation

1.  **Clone the repository.**
2.  **Set up the Python environment** (for CDK):
    ```bash
    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    pip install -r requirements-dev.txt
    ```
3.  **Install Backend Dependencies** (for Lambda functions):
    ```bash
    cd lambda
    npm install
    ```
4.  **Install Frontend Dependencies** (for the UI):
    ```bash
    cd ../ui
    npm install
    ```

## Development

To run the UI locally for development, first ensure the backend has been deployed.

1.  **Start the Vite dev server:**
    ```bash
    cd ui
    npm run dev
    ```
2.  Open your browser to the local address provided (e.g., `http://localhost:5173`).

## Testing

The project has two separate test suites.

-   **CDK Infrastructure Tests (Python):**
    ```bash
    # Run from the project root
    pytest
    ```
-   **Lambda Function Unit Tests (TypeScript):**
    ```bash
    # Run from the lambda directory
    cd lambda
    npm test
    ```

## Deployment

The entire stack (backend and frontend) can be deployed with a single command.

1.  **Build the UI for production:**
    ```bash
    # Run from the ui directory
    cd ui
    npm run build
    ```
2.  **Deploy the Full Stack:**
    ```bash
    # Run from the project root
    cd ..
    cdk deploy --parameters ExistingBucketName=<YOUR-IMAGE-S3-BUCKET-NAME>
    ```
    After deployment, the CDK will output the `CloudFrontUrl`, which is the public URL for your web application.

### Backend-Only Deployment (for Local UI Development)

If you are developing the UI locally and only need the backend deployed, you can pass the `NoUi` context variable to the CDK:

```bash
cdk deploy --context NoUi=true --parameters ExistingBucketName=<YOUR-IMAGE-S3-BUCKET-NAME>
```

This will deploy all the backend resources and enable CORS on the API Gateway. The `ApiUrl` output can then be used as the base URL for your local UI development.

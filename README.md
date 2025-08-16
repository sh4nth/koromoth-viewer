# Welcome to the KoromothViewer CDK Python project!

This is a CDK project for a serverless image viewer backend.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Setup and Deployment

This project is set up like a standard Python project. The initialization
process also creates a virtualenv within this project, stored under the `.venv`
directory. To create the virtualenv it assumes that there is a `python3`
(or `python` for Windows) executable in your path with access to the `venv`
package. If for any reason the automatic creation of the virtualenv fails,
you can create the virtualenv manually.

To manually create a virtualenv on MacOS and Linux:

```
$ python3 -m venv .venv
```

After the init process completes and the virtualenv is created, you can use the following
step to activate your virtualenv.

```
$ source .venv/bin/activate
```

Once the virtualenv is activated, you can install the required dependencies.

```
$ pip install -r requirements.txt
```

At this point you can now synthesize the CloudFormation template for this code.

```
$ cdk synth
```

To deploy the CDK stack, you need to provide the name of the existing S3 bucket that contains your images. This is done using the `ExistingBucketName` parameter.

```
$ cdk deploy --parameters ExistingBucketName=<YOUR-S3-BUCKET-NAME>
```

## Architecture

The architecture of the Koromoth Viewer backend is simple and serverless, consisting of an API Gateway, a Lambda function, and an S3 bucket.

### API Gateway

The API Gateway provides a public HTTP endpoint that clients can use to request image URLs. It is configured with CORS (Cross-Origin Resource Sharing) to allow requests from any origin. The following endpoints are available:

*   `GET /image?key=<FILENAME>`: Retrieves a pre-signed URL for a specific image.
*   `GET /images`: Retrieves a list of all available image keys in the bucket.

### Lambda Function

The Lambda function is a Node.js function that contains the core logic of the backend. It receives the request from the API Gateway and extracts the image key from the query string parameters.

Using the AWS SDK, the function generates a pre-signed URL for the requested image in the S3 bucket. This URL grants temporary, secure access to the image file. The Lambda function then returns the pre-signed URL to the client in a JSON response.

The name of the S3 bucket is passed to the Lambda function as an environment variable, which is set by the CDK stack during deployment.

### S3 Bucket

The S3 bucket is the storage for the images. The CDK stack does not create a new bucket; instead, it references an existing bucket that you specify during deployment. The Lambda function is granted read-only access to this bucket, allowing it to generate pre-signed URLs for the objects within it.

## Useful commands

 * `cdk ls`          list all stacks in the app
 * `cdk synth`       emits the synthesized CloudFormation template
 * `cdk deploy --parameters ExistingBucketName=<YOUR-S3-BUCKET-NAME>`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk docs`        open CDK documentation

Enjoy!
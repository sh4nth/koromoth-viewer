import os
from aws_cdk import (
    Stack,
    aws_s3 as s3,
    aws_s3_deployment as s3_deployment,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_lambda_nodejs as nodejs,
    aws_lambda as lambda_,
    aws_apigateway as apigw,
    aws_dynamodb as dynamodb,
    CfnOutput,
    CfnParameter,
    Duration,
    RemovalPolicy,
)
from constructs import Construct

class KoromothViewerCdkPyStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # --- Backend Resources ---

        existing_bucket_name_param = CfnParameter(self, "ExistingBucketName",
            type="String",
            description="The name of the existing S3 bucket where images are stored.",
        )

        images_bucket = s3.Bucket.from_bucket_name(
            self,
            "ExistingImagesBucket",
            bucket_name=existing_bucket_name_param.value_as_string
        )

        image_tags_table = dynamodb.Table(self, "ImageTagsTable",
            partition_key=dynamodb.Attribute(name="ImageKey", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )

        tag_images_table = dynamodb.Table(self, "TagImagesTable",
            partition_key=dynamodb.Attribute(name="Tag", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="ImageKey", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.DESTROY,
        )

        common_nodejs_props = {
            "handler": "handler",
            "runtime": lambda_.Runtime.NODEJS_20_X,
            "bundling": nodejs.BundlingOptions(
                force_docker_bundling=False
            ),
            "deps_lock_file_path": "lambda/package-lock.json",
            "memory_size": 128,
            "timeout": Duration.seconds(30),
        }

        serve_image_lambda = nodejs.NodejsFunction(self, "ServeImageLambda",
            entry="lambda/get-image.ts",
            environment={ "BUCKET_NAME": existing_bucket_name_param.value_as_string },
            **common_nodejs_props
        )
        images_bucket.grant_read(serve_image_lambda)

        get_images_lambda = nodejs.NodejsFunction(self, "GetImagesLambda",
            entry="lambda/get-images.ts",
            environment={
                "BUCKET_NAME": existing_bucket_name_param.value_as_string,
                "TAG_IMAGES_TABLE_NAME": tag_images_table.table_name,
            },
            **common_nodejs_props
        )
        images_bucket.grant_read(get_images_lambda)
        tag_images_table.grant_read_data(get_images_lambda)

        add_tags_lambda = nodejs.NodejsFunction(self, "AddTagsLambda",
            entry="lambda/add-tags.ts",
            environment={
                "IMAGE_TAGS_TABLE_NAME": image_tags_table.table_name,
                "TAG_IMAGES_TABLE_NAME": tag_images_table.table_name,
            },
            **common_nodejs_props
        )
        image_tags_table.grant_write_data(add_tags_lambda)
        tag_images_table.grant_write_data(add_tags_lambda)

        get_tags_lambda = nodejs.NodejsFunction(self, "GetTagsLambda",
            entry="lambda/get-tags.ts",
            environment={ "IMAGE_TAGS_TABLE_NAME": image_tags_table.table_name },
            **common_nodejs_props
        )
        image_tags_table.grant_read_data(get_tags_lambda)

        api = apigw.RestApi(self, "KoromothViewerApi",
            rest_api_name="Koromoth Viewer Backend API",
            description="Serves presigned URLs for images from S3",
        )

        # --- API Gateway Resources ---
        api_root = api.root.add_resource("api")

        # /api/images
        images = api_root.add_resource("images")
        images.add_method("GET", apigw.LambdaIntegration(get_images_lambda))

        # /api/image/{key}
        image_key = api_root.add_resource("image").add_resource("{key}")
        image_key.add_method("GET", apigw.LambdaIntegration(serve_image_lambda))

        # /api/image/{key}/tags
        image_tags = image_key.add_resource("tags")
        image_tags.add_method("GET", apigw.LambdaIntegration(get_tags_lambda))
        image_tags.add_method("POST", apigw.LambdaIntegration(add_tags_lambda))

        # --- Frontend Hosting Resources ---

        # S3 bucket to store the built UI assets
        ui_bucket = s3.Bucket(self, "UiBucket",
            bucket_name=f"koromoth-viewer-ui-bucket-{self.account}-{self.region}",
            public_read_access=False,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
        )

        # CloudFront distribution to serve the UI and proxy API calls
        distribution = cloudfront.Distribution(self, "CloudFrontDistribution",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3Origin(ui_bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            ),
            default_root_object="index.html",
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                )
            ]
        )

        # Add a new behavior for the API Gateway
        api_origin = origins.HttpOrigin(f"{api.rest_api_id}.execute-api.{self.region}.amazonaws.com",
            origin_path=f"/{api.deployment_stage.stage_name}"
        )
        distribution.add_behavior("/api/*", api_origin)

        # Deploy the UI assets to the S3 bucket
        s3_deployment.BucketDeployment(self, "DeployUi",
            sources=[s3_deployment.Source.asset(os.path.join(os.path.dirname(__file__), "..", "ui", "dist"))],
            destination_bucket=ui_bucket,
            distribution=distribution,
            distribution_paths=["/*"],
        )

        # --- CDK Outputs ---
        CfnOutput(self, "CloudFrontUrl",
            value=f"https://{distribution.distribution_domain_name}",
            description="The URL for the CloudFront distribution.",
        )
        CfnOutput(self, "UiBucketName",
            value=ui_bucket.bucket_name,
            description="The name of the S3 bucket for the UI assets.",
        )
        CfnOutput(self, "ImageTagsTableName",
            value=image_tags_table.table_name,
            description="The name of the DynamoDB table that stores image tags.",
        )
        CfnOutput(self, "TagImagesTableName",
            value=tag_images_table.table_name,
            description="The name of the DynamoDB table that serves as the inverted index for tags.",
        )

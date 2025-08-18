import aws_cdk as cdk
import aws_cdk.assertions as assertions

from koromoth_viewer_cdk_py.koromoth_viewer_cdk_py_stack import KoromothViewerCdkPyStack


def test_dynamodb_tables_created():
    app = cdk.App()
    stack = KoromothViewerCdkPyStack(app, "KoromothViewerCdkPyStack")
    template = assertions.Template.from_stack(stack)

    template.resource_count_is("AWS::DynamoDB::Table", 2)

    template.has_resource_properties(
        "AWS::DynamoDB::Table",
        {
            "KeySchema": [{"AttributeName": "ImageKey", "KeyType": "HASH"}],
            "AttributeDefinitions": [
                {"AttributeName": "ImageKey", "AttributeType": "S"}
            ],
        },
    )

    template.has_resource_properties(
        "AWS::DynamoDB::Table",
        {
            "KeySchema": [
                {"AttributeName": "Tag", "KeyType": "HASH"},
                {"AttributeName": "ImageKey", "KeyType": "RANGE"},
            ],
            "AttributeDefinitions": [
                {"AttributeName": "Tag", "AttributeType": "S"},
                {"AttributeName": "ImageKey", "AttributeType": "S"},
            ],
        },
    )


def test_lambda_functions_created_with_correct_properties():
    app = cdk.App()
    stack = KoromothViewerCdkPyStack(app, "KoromothViewerCdkPyStack")
    template = assertions.Template.from_stack(stack)

    # Instead of a strict count, we verify that each of our specific
    # application lambdas exists with the correct properties.
    # This ignores the helper functions created by other constructs (e.g., BucketDeployment).

    # GetImagesLambda
    template.has_resource_properties(
        "AWS::Lambda::Function",
        {
            "Environment": {
                "Variables": {
                    "TAG_IMAGES_TABLE_NAME": assertions.Match.any_value(),
                }
            }
        },
    )

    # AddTagsLambda
    template.has_resource_properties(
        "AWS::Lambda::Function",
        {
            "Environment": {
                "Variables": {
                    "IMAGE_TAGS_TABLE_NAME": assertions.Match.any_value(),
                    "TAG_IMAGES_TABLE_NAME": assertions.Match.any_value(),
                }
            }
        },
    )

    # GetTagsLambda
    template.has_resource_properties(
        "AWS::Lambda::Function",
        {
            "Environment": {
                "Variables": {"IMAGE_TAGS_TABLE_NAME": assertions.Match.any_value()}
            }
        },
    )

    # ServeImageLambda
    template.has_resource_properties(
        "AWS::Lambda::Function",
        {"Environment": {"Variables": {"BUCKET_NAME": assertions.Match.any_value()}}},
    )


def test_api_gateway_integrations():
    app = cdk.App()
    stack = KoromothViewerCdkPyStack(app, "KoromothViewerCdkPyStack")
    template = assertions.Template.from_stack(stack)

    # Find the logical ID of the GetImagesLambda construct
    get_images_lambda_construct = stack.node.find_child("GetImagesLambda")
    get_images_lambda_id = stack.get_logical_id(
        get_images_lambda_construct.node.default_child
    )

    # Assert that the GET /api/images endpoint is integrated with the GetImagesLambda
    template.has_resource_properties(
        "AWS::ApiGateway::Method",
        {
            "HttpMethod": "GET",
            "Integration": {
                "Uri": {
                    "Fn::Join": [
                        "",
                        [
                            "arn:",
                            {"Ref": "AWS::Partition"},
                            ":apigateway:",
                            {"Ref": "AWS::Region"},
                            ":lambda:path/2015-03-31/functions/",
                            {"Fn::GetAtt": [get_images_lambda_id, "Arn"]},
                            "/invocations",
                        ],
                    ]
                }
            },
        },
    )

    # Find the logical ID of the AddTagsLambda construct
    add_tags_lambda_construct = stack.node.find_child("AddTagsLambda")
    add_tags_lambda_id = stack.get_logical_id(
        add_tags_lambda_construct.node.default_child
    )

    # Assert that the POST /api/image/{key}/tags endpoint is integrated with the AddTagsLambda
    template.has_resource_properties(
        "AWS::ApiGateway::Method",
        {
            "HttpMethod": "POST",
            "Integration": {
                "Uri": {
                    "Fn::Join": [
                        "",
                        [
                            "arn:",
                            {"Ref": "AWS::Partition"},
                            ":apigateway:",
                            {"Ref": "AWS::Region"},
                            ":lambda:path/2015-03-31/functions/",
                            {"Fn::GetAtt": [add_tags_lambda_id, "Arn"]},
                            "/invocations",
                        ],
                    ]
                }
            },
        },
    )

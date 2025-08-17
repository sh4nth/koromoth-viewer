import aws_cdk as cdk
import aws_cdk.assertions as assertions

from koromoth_viewer_cdk_py.koromoth_viewer_cdk_py_stack import KoromothViewerCdkPyStack

def test_dynamodb_tables_created():
    app = cdk.App()
    stack = KoromothViewerCdkPyStack(app, "KoromothViewerCdkPyStack")
    template = assertions.Template.from_stack(stack)

    template.resource_count_is("AWS::DynamoDB::Table", 2)

    template.has_resource_properties("AWS::DynamoDB::Table", {
        "KeySchema": [{ "AttributeName": "ImageKey", "KeyType": "HASH" }],
        "AttributeDefinitions": [{ "AttributeName": "ImageKey", "AttributeType": "S" }]
    })

    template.has_resource_properties("AWS::DynamoDB::Table", {
        "KeySchema": [
            { "AttributeName": "Tag", "KeyType": "HASH" },
            { "AttributeName": "ImageKey", "KeyType": "RANGE" }
        ],
        "AttributeDefinitions": [
            { "AttributeName": "Tag", "AttributeType": "S" },
            { "AttributeName": "ImageKey", "AttributeType": "S" }
        ]
    })

def test_lambda_functions_created_with_correct_properties():
    app = cdk.App()
    stack = KoromothViewerCdkPyStack(app, "KoromothViewerCdkPyStack")
    template = assertions.Template.from_stack(stack)

    template.resource_count_is("AWS::Lambda::Function", 4)

    # Assert properties for the GetImagesLambda
    template.has_resource_properties("AWS::Lambda::Function", {
        "Handler": "index.handler",
        "Runtime": "nodejs20.x",
        "MemorySize": 128,
        "Timeout": 30,
        "Environment": {
            "Variables": {
                "BUCKET_NAME": assertions.Match.any_value(),
                "TAG_IMAGES_TABLE_NAME": assertions.Match.any_value()
            }
        }
    })

    # Assert properties for the AddTagsLambda
    template.has_resource_properties("AWS::Lambda::Function", {
        "Handler": "index.handler",
        "Runtime": "nodejs20.x",
        "Environment": {
            "Variables": {
                "IMAGE_TAGS_TABLE_NAME": assertions.Match.any_value(),
                "TAG_IMAGES_TABLE_NAME": assertions.Match.any_value()
            }
        }
    })

def test_api_gateway_endpoints():
    app = cdk.App()
    stack = KoromothViewerCdkPyStack(app, "KoromothViewerCdkPyStack")
    template = assertions.Template.from_stack(stack)

    template.has_resource_properties("AWS::ApiGateway::Resource", {
        "PathPart": "images"
    })
    template.has_resource_properties("AWS::ApiGateway::Resource", {
        "PathPart": "image"
    })
    template.has_resource_properties("AWS::ApiGateway::Resource", {
        "PathPart": "tags"
    })

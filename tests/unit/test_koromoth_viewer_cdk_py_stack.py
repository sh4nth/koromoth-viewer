import aws_cdk as cdk
import aws_cdk.assertions as assertions
import json

from koromoth_viewer_cdk_py.koromoth_viewer_cdk_py_stack import KoromothViewerCdkPyStack

def test_cdk_stack_snapshot(snapshot):
    app = cdk.App()
    stack = KoromothViewerCdkPyStack(app, "KoromothViewerCdkPyStack")
    template = assertions.Template.from_stack(stack)
    
    # Convert the template to a formatted JSON string before snapshotting
    template_json = json.dumps(template.to_json(), indent=4, sort_keys=True)
    snapshot.assert_match(template_json, 'cdk_stack_template.json')

def test_dynamodb_tables_created():
    app = cdk.App()
    stack = KoromothViewerCdkPyStack(app, "KoromothViewerCdkPyStack")
    template = assertions.Template.from_stack(stack)

    # Assert that two DynamoDB tables are created
    template.resource_count_is("AWS::DynamoDB::Table", 2)

    # Assert properties of the ImageTagsTable
    template.has_resource_properties("AWS::DynamoDB::Table", {
        "KeySchema": [{
            "AttributeName": "ImageKey",
            "KeyType": "HASH"
        }],
        "AttributeDefinitions": [{
            "AttributeName": "ImageKey",
            "AttributeType": "S"
        }]
    })

    # Assert properties of the TagImagesTable
    template.has_resource_properties("AWS::DynamoDB::Table", {
        "KeySchema": [
            {
                "AttributeName": "Tag",
                "KeyType": "HASH"
            },
            {
                "AttributeName": "ImageKey",
                "KeyType": "RANGE"
            }
        ],
        "AttributeDefinitions": [
            {
                "AttributeName": "Tag",
                "AttributeType": "S"
            },
            {
                "AttributeName": "ImageKey",
                "AttributeType": "S"
            }
        ]
    })

def test_lambda_functions_created():
    app = cdk.App()
    stack = KoromothViewerCdkPyStack(app, "KoromothViewerCdkPyStack")
    template = assertions.Template.from_stack(stack)

    # Assert that the correct number of Lambda functions are created
    template.resource_count_is("AWS::Lambda::Function", 4)

def test_api_gateway_endpoints():
    app = cdk.App()
    stack = KoromothViewerCdkPyStack(app, "KoromothViewerCdkPyStack")
    template = assertions.Template.from_stack(stack)

    # Assert that the API Gateway has the expected top-level resources
    template.has_resource_properties("AWS::ApiGateway::Resource", {
        "PathPart": "images"
    })
    template.has_resource_properties("AWS::ApiGateway::Resource", {
        "PathPart": "image"
    })
    template.has_resource_properties("AWS::ApiGateway::Resource", {
        "PathPart": "tags"
    })

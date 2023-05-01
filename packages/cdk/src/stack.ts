import { join, resolve } from "node:path";
import { Construct } from "constructs";

import { Stack, StackProps } from "aws-cdk-lib";

// Lambda
import { Runtime } from "aws-cdk-lib/aws-lambda";

// NodeJs
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

// ApiGatewayV2
import { HttpApi, HttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";

// EC2 includes networking
import {
  Vpc,
  SubnetType,
  SecurityGroup,
  Port,
  InstanceType,
  InstanceClass,
  InstanceSize,
} from "aws-cdk-lib/aws-ec2";

// RDS
import {
  Credentials,
  DatabaseCluster,
  DatabaseClusterEngine,
  AuroraPostgresEngineVersion,
} from "aws-cdk-lib/aws-rds";

export class CdkHelloStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create a VPC
    const vpc = new Vpc(this, "hello-vpc", {
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "private",
          subnetType: SubnetType.PRIVATE_WITH_EGRESS,
        },
        { cidrMask: 24, name: "public", subnetType: SubnetType.PUBLIC },
      ],
    });

    // Create a security group for database
    const databaseSecurityGroup = new SecurityGroup(
      this,
      "database-security-group",
      { vpc }
    );

    // Create a security group for lambda
    const lambdaSecurityGroup = new SecurityGroup(
      this,
      "lambda-security-group",
      {
        vpc,
      }
    );

    // Define the relationships between those groups
    databaseSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      Port.tcp(5432),
      "Lambda access to postgresql server"
    );

    // @todo bring these in as props
    const databaseName = "hello";
    const databaseAdminUser = "helloadmin";

    // Create a database
    const database = new DatabaseCluster(this, "hello-database", {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_15_2,
      }),
      storageEncrypted: true,
      defaultDatabaseName: databaseName,
      credentials: Credentials.fromGeneratedSecret(databaseAdminUser),
      deletionProtection: false, // @todo if current environment is not development, yes, protect!
      instanceProps: {
        instanceType: InstanceType.of(
          InstanceClass.BURSTABLE2,
          InstanceSize.SMALL
        ), // @todo revisit
        vpc,
        vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      },
      securityGroups: [databaseSecurityGroup],
      maxAllocatedStorage: 20, // defined in GB
    });

    if (!database.secret)
      throw new Error("The database did not generate a secret!");

    // Create an API Gateway API
    const helloApi = new HttpApi(this, "hello-api");

    // Create a lambda function
    // @todo resolve the workspace package and get the index.ts from there

    const statusLambda = new NodejsFunction(this, "status-lambda", {
      runtime: Runtime.NODEJS_18_X,
      entry: require.resolve("@hello-cdk-localstack/status"),
      bundling: {
        externalModules: ["pg-native"],
      },
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        DEPLOYMENT_TIMESTAMP: String(Date.now()),
        DATABASE_HOST: database.clusterEndpoint.hostname,
        DATABASE_PORT: database.clusterEndpoint.port,
        DATABASE_SECRET_ARN: database.secret.secretFullArn,
        DATABASE_NAME: databaseName,
      },
    });

    // Grant the lambda access to read the database password
    database.secret.grantRead(statusLambda);

    // Create the API integration with the lambda
    const statusLambdaIntegration = new HttpLambdaIntegration(
      "status-lambda-integration",
      statusLambda
    );

    // Route the API
    helloApi.addRoutes({
      path: "/",
      methods: [HttpMethod.ANY],
      integration: statusLambdaIntegration,
    });
  }
}

import type { Handler } from 'aws-cdk-lib';
import { SecretsManager } from 'aws-sdk';
import { Client } from 'pg';

export const handler: Handler = async() => {

  const body = {
    life_universe_everything: 42,
    deployment_timestamp: process.env.DEPLOYMENT_TIMESTAMP ?? 'unset! :(',
    database: { status: await checkDatabase() }
  };

  return {
    statusCode: 200,
    body: JSON.stringify(body)
  }

};
    

const checkDatabase = async (): Promise<string>  => {

    try { 
    const database = process.env.DATABASE_NAME;
    const secret_arn = process.env.DATABASE_SECRET_ARN;
    const host = process.env.LOCALSTACK_HOSTNAME ?? process.env.DATABASE_HOST;
    const port = process.env.DATABASE_PORT;

    if(!database) throw new Error('Missing or empty database name');
    if(!secret_arn) throw new Error('Missing or empty database secret arn');
    if(!host) throw new Error('Missing or empty database host');
    if(!port) throw new Error('Missing or empty database port');

    const secretManager = new SecretsManager({
      region: 'us-east-1', // @todo always?
    });

    const secret = await secretManager.getSecretValue({
	SecretId: secret_arn
    }).promise();

    if(!secret) throw new Error('Retrieved secret was missing');

    // secret as generated is a JSON with a username and password
    const { username: user, password } = JSON.parse(secret.SecretString);

    const client = new Client({
      user,
      host,
      database,
      password,
      port
    });

    await client.connect();
    await client.end();

    return 'OK';
    }catch(error) {
      return `Error: ${error instanceof Error ? error.message : String(error)}`;
    }

};

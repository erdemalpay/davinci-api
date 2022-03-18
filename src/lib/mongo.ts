import { MongoClient } from 'mongodb';

async function getClient() {
  const uri = 'mongodb://localhost:27018/davinci?retryWrites=true&w=majority';

  const client = new MongoClient(uri);

  // Connect to the MongoDB cluster
  await client.connect();
  return client;
}

export async function getItems(collection: string) {
  const client = await getClient();
  return client.db().collection(collection).find().toArray();
}

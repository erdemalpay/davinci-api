import { Model } from 'mongoose';
import { usernamify } from './usernamify';

export async function generateUniqueSlug(
  model: Model<any>,
  name: string,
): Promise<string> {
  const base = usernamify(name).replaceAll('_', '-');
  let slug = base;
  let counter = 2;
  while (await model.findOne({ slug }).exec()) {
    slug = `${base}-${counter}`;
    counter++;
  }
  return slug;
}

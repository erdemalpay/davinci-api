import { Schema, Model, Document } from 'mongoose';

export function purifySchema<T extends Document>(
  schema: Schema<T, Model<T>>,
  additionalProps: string[] = [],
) {
  schema.methods.toJSON = function () {
    const defaultProps = ['__v'];
    const obj = this.toObject();

    const props = [...defaultProps, ...additionalProps];

    props.forEach((prop) => delete obj[prop]);

    return obj;
  };
}

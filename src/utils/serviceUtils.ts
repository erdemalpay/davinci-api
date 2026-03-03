import { HttpException, HttpStatus } from '@nestjs/common';
import { ActivityType } from '../modules/activity/activity.dto';
import { ActivityService } from '../modules/activity/activity.service';
import { UserService } from '../modules/user/user.service';
import { extractRefId } from './tsUtils';

export function assertFound<T>(
  record: T | null | undefined,
  message: string,
): asserts record is T {
  if (!record) {
    throw new HttpException(message, HttpStatus.NOT_FOUND);
  }
}

export async function wrapHttpException<T>(
  fn: () => Promise<T>,
  message: string,
  status = HttpStatus.BAD_REQUEST,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new HttpException(message, status);
  }
}

export function toPlainObject<T>(
  record: T & { toObject?(): unknown },
): unknown {
  return record.toObject ? record.toObject() : record;
}

export async function tryAddActivity(
  activityService: ActivityService,
  userService: UserService,
  userRef: unknown,
  activityType: ActivityType,
  payload: unknown,
  label: string,
): Promise<void> {
  try {
    const userId = String(
      extractRefId(userRef as Parameters<typeof extractRefId>[0]),
    );
    const user = await userService.findById(userId);
    if (user) {
      await activityService.addActivity(user, activityType, payload as never);
    }
  } catch {
    console.error(`Failed to add ${label} activity`);
  }
}

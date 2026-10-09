jest.mock('../location/location.service', () => ({
  LocationService: class LocationService {},
}));
jest.mock('../activity/activity.service', () => ({
  ActivityService: class ActivityService {},
}));
jest.mock('./buttonCall.assignment.service', () => ({
  ButtonCallAssignmentService: class ButtonCallAssignmentService {},
}));
jest.mock('./unmetExplanationRequest.service', () => ({
  UnmetExplanationRequestService: class UnmetExplanationRequestService {},
}));

import { ButtonCallService } from './buttonCall.service';
import { ButtonCallTypeEnum } from './dto/create-buttonCall.dto';

describe('ButtonCallService frees the assignee', () => {
  function build(call: Record<string, unknown> | null) {
    const doc = call && {
      ...call,
      set: jest.fn(),
      save: jest.fn(async () => undefined),
    };
    const buttonCallModel = {
      findOne: jest.fn(async () => doc),
      findById: jest.fn(async () => doc),
      findByIdAndDelete: jest.fn(async () => doc),
    };
    const assignment = { handleStaffAvailabilityChanged: jest.fn() };
    const service = new ButtonCallService(
      buttonCallModel as never,
      {} as never,
      { emitButtonCallChanged: jest.fn() } as never,
      { addActivity: jest.fn(async () => undefined) } as never,
      {} as never,
      assignment as never,
      {} as never,
      {} as never,
    );
    return { service, assignment };
  }

  const closeDto = { tableName: '5', location: 1, hour: '12:30:00' };

  it('assigns waiting calls right away when a GM closes their call', async () => {
    const { service, assignment } = build({
      _id: 1,
      type: ButtonCallTypeEnum.GAMEMASTERCALL,
      assignedTo: 'mert',
      startHour: '12:20:00',
    });

    await service.close(null, closeDto);

    expect(assignment.handleStaffAvailabilityChanged).toHaveBeenCalledTimes(1);
  });

  it('does nothing extra for an unassigned GM call', async () => {
    const { service, assignment } = build({
      _id: 1,
      type: ButtonCallTypeEnum.GAMEMASTERCALL,
      startHour: '12:20:00',
    });

    await service.close(null, closeDto);

    expect(assignment.handleStaffAvailabilityChanged).not.toHaveBeenCalled();
  });

  it('does nothing extra for a service call', async () => {
    const { service, assignment } = build({
      _id: 1,
      type: ButtonCallTypeEnum.ORDERCALL,
      startHour: '12:20:00',
    });

    await service.close(null, closeDto);

    expect(assignment.handleStaffAvailabilityChanged).not.toHaveBeenCalled();
  });

  it('frees the assignee when an open GM call is deleted', async () => {
    const { service, assignment } = build({
      _id: 1,
      type: ButtonCallTypeEnum.GAMEMASTERCALL,
      assignedTo: 'mert',
    });

    await service.remove(1);

    expect(assignment.handleStaffAvailabilityChanged).toHaveBeenCalledTimes(1);
  });
});

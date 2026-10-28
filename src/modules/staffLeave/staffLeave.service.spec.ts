import { Model } from 'mongoose';
import { User } from '../user/user.schema';
import { AppWebSocketGateway } from '../websocket/websocket.gateway';
import { StaffLeave, StaffLeaveType } from './staffLeave.schema';
import { StaffLeaveService } from './staffLeave.service';

function build(staffLeaveModel: object) {
  const gateway = { emitStaffLeaveChanged: jest.fn() };
  const service = new StaffLeaveService(
    {} as unknown as Model<StaffLeaveType>,
    staffLeaveModel as unknown as Model<StaffLeave>,
    gateway as unknown as AppWebSocketGateway,
  );
  return { service, gateway };
}

const user = { _id: 'mehmet' } as unknown as User;

describe('findAll', () => {
  it('aralıkla kesişen kayıtları ister', async () => {
    const lean = jest.fn().mockResolvedValue([]);
    const sort = jest.fn().mockReturnValue({ lean });
    const find = jest.fn().mockReturnValue({ sort });
    const { service } = build({ find });
    await service.findAll({ after: '2026-10-01', before: '2026-10-31' });
    expect(find).toHaveBeenCalledWith({
      startDate: { $lte: '2026-10-31' },
      endDate: { $gte: '2026-10-01' },
    });
  });
});

describe('create', () => {
  it('bitişten sonra başlayan kaydı reddeder', async () => {
    const create = jest.fn();
    const { service } = build({ create });
    await expect(
      service.create(user, {
        user: 'ayse',
        type: 1,
        startDate: '2026-10-10',
        endDate: '2026-10-09',
      }),
    ).rejects.toThrow('Start date must not be after end date');
    expect(create).not.toHaveBeenCalled();
  });

  it('tek günlük kaydı ekleyeniyle kaydeder', async () => {
    const create = jest.fn().mockResolvedValue({ _id: 1 });
    const { service, gateway } = build({ create });
    await service.create(user, {
      user: 'ayse',
      type: 4,
      startDate: '2026-10-09',
      endDate: '2026-10-09',
    });
    expect(create).toHaveBeenCalledWith({
      user: 'ayse',
      type: 4,
      startDate: '2026-10-09',
      endDate: '2026-10-09',
      createdBy: 'mehmet',
    });
    expect(gateway.emitStaffLeaveChanged).toHaveBeenCalled();
  });
});

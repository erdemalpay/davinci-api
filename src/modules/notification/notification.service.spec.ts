jest.mock('@shopify/shopify-api/adapters/node', () => ({}), {
  virtual: true,
});

import { NotificationEventType } from './notification.dto';
import { NotificationService } from './notification.service';

const template = (overrides: Record<string, unknown> = {}) => ({
  event: NotificationEventType.UNFINISHEDVISIT,
  isAssigned: true,
  isActive: true,
  selectedUsers: [],
  selectedRoles: [11, 3, 1],
  selectedLocations: [],
  mutedBy: ['kemal'],
  ...overrides,
});

const buildService = (templates: unknown[]) => {
  const saved: any[] = [];
  const service = new (NotificationService as any)();
  service.findAllEventNotifications = async () => templates;
  service.notificationModel = {
    create: async (doc: any) => {
      saved.push(doc);
      return doc;
    },
  };
  service.websocketGateway = { emitNotificationChanged: () => undefined };
  return { service, saved };
};

const notification = (overrides: Record<string, unknown> = {}) => ({
  type: 'WARNING',
  selectedUsers: ['mert'],
  selectedRoles: [],
  selectedLocations: [],
  seenBy: [],
  event: NotificationEventType.UNFINISHEDVISIT,
  message: { key: 'UnfinishedVisitEmployee', params: {} },
  ...overrides,
});

describe('NotificationService.createNotification', () => {
  it('sends a personal notification only to its own recipients', async () => {
    const { service, saved } = buildService([template()]);

    await service.createNotification(notification({ isPersonal: true }));

    expect(saved).toHaveLength(1);
    expect(saved[0].selectedUsers).toEqual(['mert']);
    expect(saved[0].selectedRoles).toEqual([]);
    expect(saved[0]).not.toHaveProperty('isPersonal');
  });

  it('keeps the template mute list on a personal notification', async () => {
    const { service, saved } = buildService([template()]);

    await service.createNotification(notification({ isPersonal: true }));

    expect(saved[0].mutedBy).toEqual(['kemal']);
  });

  it('does not send a personal notification when the template is turned off', async () => {
    const { service, saved } = buildService([template({ isActive: false })]);

    const result = await service.createNotification(
      notification({ isPersonal: true }),
    );

    expect(result).toBeNull();
    expect(saved).toEqual([]);
  });

  it('still takes the recipients from the template for other notifications', async () => {
    const { service, saved } = buildService([template()]);

    await service.createNotification(
      notification({ message: { key: 'UnfinishedVisit', params: {} } }),
    );

    expect(saved[0].selectedRoles).toEqual([11, 3, 1]);
  });
});

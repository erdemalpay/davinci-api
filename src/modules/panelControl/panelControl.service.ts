import { HttpService } from '@nestjs/axios';
import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, UpdateQuery } from 'mongoose';
import { usernamify } from 'src/utils/usernamify';
import { AuthorizationService } from '../authorization/authorization.service';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/user.schema';
import { DisabledCondition } from './disabledCondition.schema';
import { Page } from './page.schema';
import {
  CreateDisabledConditionDto,
  CreatePageDto,
  CreatePanelSettingsDto,
} from './panelControl.dto';
import { PanelControlGateway } from './panelControl.gateway';
import { PanelSettings } from './panelSettings.schema';

@Injectable()
export class PanelControlService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(Page.name) private pageModel: Model<Page>,
    @InjectModel(DisabledCondition.name)
    private disabledConditionModel: Model<DisabledCondition>,
    @InjectModel(PanelSettings.name)
    private panelSettingsModel: Model<PanelSettings>,
    private readonly panelControlGateway: PanelControlGateway,
    private readonly redisService: RedisService,
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly httpService: HttpService,
    @Inject(forwardRef(() => AuthorizationService))
    private readonly authorizationService: AuthorizationService,
  ) {}
  onApplicationBootstrap() {
    this.getAllRoutes();
  }
  //pages
  async findAllPages() {
    try {
      const pages = await this.pageModel.find();
      return pages;
    } catch (error) {
      console.error('Failed to retrieve pages from database:', error);
      throw new HttpException('Could not retrieve pages', HttpStatus.NOT_FOUND);
    }
  }

  async createPage(user: User, createPageDto: CreatePageDto) {
    const page = new this.pageModel({ ...createPageDto, permissionRoles: [] });
    page._id = usernamify(page.name);
    await page.save();
    this.panelControlGateway.emitPageChanged(user, page);
    return page;
  }

  async updatePage(user: User, id: string, updates: UpdateQuery<Page>) {
    // const oldPage = await this.pageModel.findById(id);
    const newPage = await this.pageModel.findByIdAndUpdate(id, updates, {
      new: true,
    });
    //TODO:this part will be done after authorization routes completed
    // if (updates.permissionRoles) {
    //   const authorizations =
    //     await this.authorizationService.findAllAuthorizations();
    //   const filteredAuthorizations = authorizations.filter((authorization) =>
    //     authorization?.relatedPages?.includes(id),
    //   );
    //   if (filteredAuthorizations.length > 0) {
    //     for (const authorization of filteredAuthorizations) {
    //       const newRoles = updates.permissionRoles;
    //       await this.authorizationService.updateAuthorization(
    //         user,
    //         authorization._id,
    //         { roles: newRoles },
    //       );
    //     }
    //   }
    // }
    this.panelControlGateway.emitPageChanged(user, newPage);

    return newPage;
  }
  async getPage(id: string) {
    const page = await this.pageModel.findById(id);
    return page;
  }
  async removePage(user: User, id: string) {
    const page = await this.pageModel.findByIdAndRemove(id);
    this.panelControlGateway.emitPageChanged(user, page);
    return page;
  }

  async createMultiplePages(user: User, createPageDto: CreatePageDto[]) {
    console.log('createMultiplePages', createPageDto);
    const pagesWithIds = createPageDto.map((page) => ({
      ...page,
      _id: usernamify(page.name),
    }));
    for (const page of pagesWithIds) {
      const foundPage = await this.pageModel.findById(page._id);
      if (foundPage) {
        await this.pageModel.findByIdAndUpdate(foundPage._id, page, {
          new: true,
        });
      } else {
        await this.pageModel.create(page);
      }
    }

    this.panelControlGateway.emitPageChanged(user, pagesWithIds);
    console.log('here');
    return pagesWithIds;
  }

  // panel settings
  async findPanelSettings() {
    const panelSettings = await this.panelSettingsModel.find();
    return panelSettings[0];
  }
  async isWeekend() {
    const today = new Date();
    const day = today.getDay();
    const panelSetting = await this.findPanelSettings();
    if (panelSetting?.isHoliday) {
      return true;
    }
    return day === 0 || day === 6;
  }

  async createPanelSetting(
    user: User,
    createPanelSettingsDto: CreatePanelSettingsDto,
  ) {
    const panelSetting = await this.findPanelSettings();
    if (panelSetting) {
      const newPanelSetting = await this.panelSettingsModel.findByIdAndUpdate(
        panelSetting._id,
        createPanelSettingsDto,
        {
          new: true,
        },
      );
      this.panelControlGateway.emitPanelSettingsChanged(user, newPanelSetting);
      return newPanelSetting;
    }
    const newPanelSetting = await this.panelSettingsModel.create(
      createPanelSettingsDto,
    );
    this.panelControlGateway.emitPanelSettingsChanged(user, newPanelSetting);
    return newPanelSetting;
  }

  getAllRoutes() {
    const { httpAdapter } = this.httpAdapterHost;

    if (httpAdapter && httpAdapter.getInstance) {
      const server = httpAdapter.getInstance();
      const routes = [];

      server._router.stack.forEach((middleware) => {
        if (middleware.route) {
          const methods = Object.keys(middleware.route.methods)
            .filter((method) => middleware.route.methods[method])
            .map((method) => method.toUpperCase());

          routes.push({
            path: middleware.route.path,
            methods,
          });
        }
      });

      return routes;
    }
    return [];
  }

  async sendWhatsAppMessage(
    to: string,
    message: string = 'hello_world',
    languageCode: string = 'en_US',
  ): Promise<any> {
    const url = 'https://graph.facebook.com/v22.0/492545467283400/messages';
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: message,
        language: {
          code: languageCode,
        },
      },
    };

    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!accessToken) {
      throw new HttpException(
        'WhatsApp access token is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      const response = await this.httpService
        .post(url, payload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })
        .toPromise();
      return response.data;
    } catch (error) {
      console.error(
        'Error sending WhatsApp message:',
        error.response?.data || error.message,
      );
      throw new HttpException(
        'Error sending WhatsApp message',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
  //disabled conditions
  async findAllDisabledConditions() {
    try {
      const conditions = await this.disabledConditionModel.find();
      return conditions;
    } catch (error) {
      console.error(
        'Failed to retrieve disabled conditions from database:',
        error,
      );
      throw new HttpException(
        'Could not retrieve disabled conditions',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async createDisabledCondition(
    user: User,
    createDto: CreateDisabledConditionDto,
  ) {
    const condition = new this.disabledConditionModel(createDto);
    condition._id = usernamify(condition.name);
    await condition.save();
    this.panelControlGateway.emitDisabledConditionChanged(user, condition);
    return condition;
  }
  async updateDisabledCondition(
    user: User,
    id: string,
    updates: UpdateQuery<DisabledCondition>,
  ) {
    const newCondition = await this.disabledConditionModel.findByIdAndUpdate(
      id,
      updates,
      {
        new: true,
      },
    );
    this.panelControlGateway.emitDisabledConditionChanged(user, newCondition);

    return newCondition;
  }
  async getDisabledCondition(id: string) {
    const condition = await this.disabledConditionModel.findById(id);
    return condition;
  }
  async removeDisabledCondition(user: User, id: string) {
    const condition = await this.disabledConditionModel.findByIdAndRemove(id);
    this.panelControlGateway.emitDisabledConditionChanged(user, condition);
    return condition;
  }
}

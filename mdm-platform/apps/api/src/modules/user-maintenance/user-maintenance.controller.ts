import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";

import { UserMaintenanceService } from "./user-maintenance.service";
import { CreateManagedUserDto } from "./dto/create-managed-user.dto";
import { UpdateManagedUserDto } from "./dto/update-managed-user.dto";

@ApiTags("user-maintenance")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"))
@Controller("user-maintenance")
export class UserMaintenanceController {
  constructor(private readonly service: UserMaintenanceService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() body: CreateManagedUserDto) {
    return this.service.create(body);
  }

  @Put(":id")
  replace(@Param("id") id: string, @Body() body: CreateManagedUserDto) {
    return this.service.replace(id, body);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateManagedUserDto) {
    return this.service.update(id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.service.remove(id);
  }
}

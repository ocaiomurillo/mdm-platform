import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";

import { HistoryService } from "./history.service";

@ApiTags("history")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"))
@Controller("history")
export class HistoryController {
  constructor(private readonly service: HistoryService) {}

  @Get()
  list() {
    return this.service.list();
  }
}

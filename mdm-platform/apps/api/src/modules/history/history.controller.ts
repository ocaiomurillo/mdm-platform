import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";

import { HistoryService } from "./history.service";
import { HistoryListQueryDto } from "./dto/history-query.dto";

@ApiTags("history")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"))
@Controller("history")
export class HistoryController {
  constructor(private readonly service: HistoryService) {}

  @Get()
  list(@Query() query: HistoryListQueryDto) {
    return this.service.list(query);
  }
}

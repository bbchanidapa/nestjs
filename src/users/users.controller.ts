import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthTokenGuard } from '../auth/auth-token.guard.js';
import { CreateUserDto } from './dto/create-user.dto';
import { ReplaceUserDto } from './dto/replace-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() body: CreateUserDto) {
    return this.usersService.createUser(body);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @UseGuards(AuthTokenGuard)
  @Patch(':id')
  updateById(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.usersService.updateById(id, body);
  }

  @UseGuards(AuthTokenGuard)
  @Put(':id')
  replaceById(@Param('id') id: string, @Body() body: ReplaceUserDto) {
    return this.usersService.replaceUserById(id, body);
  }

  @UseGuards(AuthTokenGuard)
  @Delete(':id')
  deleteById(@Param('id') id: string) {
    return this.usersService.deleteById(id);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
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

  @Patch(':id')
  updateById(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.usersService.updateById(id, body);
  }

  @Put(':id')
  replaceById(@Param('id') id: string, @Body() body: ReplaceUserDto) {
    return this.usersService.replaceUserById(id, body);
  }

  @Delete(':id')
  deleteById(@Param('id') id: string) {
    return this.usersService.deleteById(id);
  }
}

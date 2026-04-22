import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { ReplaceUserDto } from './dto/replace-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { type UserRow, UsersService } from './users.service';

type ReplaceUserService = Pick<UsersService, 'replaceUserById'>;

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() body: CreateUserDto): Promise<UserRow> {
    const service: {
      createUser(payload: CreateUserDto): Promise<UserRow>;
    } = this.usersService;

    return service.createUser(body);
  }

  @Get()
  findAll(): Promise<UserRow[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  findById(@Param('id') id: string): Promise<UserRow> {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  updateById(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
  ): Promise<UserRow> {
    return this.usersService.updateById(id, body);
  }

  @Put(':id')
  replaceById(
    @Param('id') id: string,
    @Body() body: ReplaceUserDto,
  ): Promise<UserRow> {
    return (this.usersService as ReplaceUserService).replaceUserById(id, body);
  }
}

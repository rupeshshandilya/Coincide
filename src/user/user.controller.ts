import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UserService } from './user.service';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.createUserConnection(createUserDto);
  }

  @Get(':userId')
  findOne(@Param('userId') userId: string) {
    return this.userService.getUserConnection(userId);
  }
}

import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import axios from 'axios';
import { Platform } from 'generated/prisma';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  // Get followers and following from GitHub
  async fetchGitHubData(username: string) {
    try {
      // Get followers
      const followersResponse = await axios.get(
        `https://api.github.com/users/${username}/followers`,
      );
      const followers = followersResponse.data.map((user) => user.login);

      // Get following
      const followingResponse = await axios.get(
        `https://api.github.com/users/${username}/following`,
      );
      const following = followingResponse.data.map((user) => user.login);

      return { followers, following };
    } catch (error) {
      if (error.response?.status === 404) {
        throw new HttpException('GitHub user not found', HttpStatus.NOT_FOUND);
      }
      throw new HttpException(
        'Could not get GitHub data',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Save or update a user in our database
  async saveUser(username: string) {
    try {
      return await this.prisma.user.upsert({
        where: {
          platform_platformUserId: {
            platform: Platform.GITHUB,
            platformUserId: username,
          },
        },
        create: {
          platform: Platform.GITHUB,
          platformUserId: username,
          username: username,
        },
        update: {
          username: username, // Update username in case it changed
        },
      });
    } catch (error) {
      // If upsert fails, try to find the user
      const existingUser = await this.prisma.user.findUnique({
        where: {
          platform_platformUserId: {
            platform: Platform.GITHUB,
            platformUserId: username,
          },
        },
      });

      if (existingUser) {
        return existingUser;
      }

      throw error;
    }
  }

  // Save a follow relationship
  async saveFollow(followerId: string, followingId: string) {
    return this.prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
      create: {
        followerId,
        followingId,
      },
      update: {},
    });
  }

  // Main function to save all user connections
  async createUserConnection(createUserDto: CreateUserDto) {
    try {
      // Get fresh data from GitHub first to verify user exists
      const { followers, following } = await this.fetchGitHubData(
        createUserDto.userId,
      );

      // Check if user data already exists in our database
      const existingUser = await this.prisma.user.findUnique({
        where: {
          platform_platformUserId: {
            platform: Platform.GITHUB,
            platformUserId: createUserDto.userId,
          },
        },
        include: {
          followers: true,
          following: true,
        },
      });

      // If user exists and has the same number of connections, return existing data
      if (existingUser) {
        return {
          message: 'User data already exists and is up to date',
          isExisting: true,
        };
      }

      // Save the main user
      const mainUser = await this.saveUser(createUserDto.userId);

      // Process followers in parallel
      const followerPromises = followers.map(async (followerUsername) => {
        const follower = await this.saveUser(followerUsername);
        return this.saveFollow(follower.id, mainUser.id);
      });

      // Process following in parallel
      const followingPromises = following.map(async (followingUsername) => {
        const followingUser = await this.saveUser(followingUsername);
        return this.saveFollow(mainUser.id, followingUser.id);
      });

      // Wait for all operations to complete
      await Promise.all([...followerPromises, ...followingPromises]);

      return {
        message: 'User data has been created successfully',
        isExisting: false,
      };
    } catch (error) {
      console.log(error.message);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Could not save user connections',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Get all user connections
  async getUserConnection(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        platform_platformUserId: {
          platform: Platform.GITHUB,
          platformUserId: userId,
        },
      },
      include: {
        followers: {
          include: {
            follower: true,
          },
        },
        following: {
          include: {
            following: true,
          },
        },
      },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return {
      user: {
        id: user.id,
        username: user.username,
      },
      followers: user.followers.map((f) => f.follower.username),
      following: user.following.map((f) => f.following.username),
      lastUpdated: user.updatedAt,
    };
  }
}

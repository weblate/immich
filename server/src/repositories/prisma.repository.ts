import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { findNonDeletedExtension } from 'src/prisma/find-non-deleted';
import { kyselyExtension } from 'src/prisma/kysely';

declare global {
  interface BigInt {
    toJSON(): number | string;
  }
}

const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

BigInt.prototype.toJSON = function () {
  return this.valueOf() > MAX_SAFE_INTEGER ? this.toString() : Number(this.valueOf());
};

function extendClient(base: PrismaClient) {
  return base.$extends(findNonDeletedExtension).$extends(kyselyExtension);
}

class UntypedExtendedClient extends PrismaClient {
  constructor(options?: ConstructorParameters<typeof PrismaClient>[0]) {
    super(options);

    return extendClient(this) as this;
  }
}

const ExtendedPrismaClient = UntypedExtendedClient as unknown as new (
  options?: ConstructorParameters<typeof PrismaClient>[0],
) => ReturnType<typeof extendClient>;

@Injectable()
export class PrismaRepository extends ExtendedPrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

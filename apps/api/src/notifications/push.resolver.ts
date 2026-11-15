import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AllowWithoutMfa, CurrentActor, lim, type Actor } from '../common/context';
import { Throttle } from '@nestjs/throttler';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

@Resolver()
export class PushResolver {
  constructor(private readonly push: PushService, private readonly notifications: NotificationsService) {}
  @AllowWithoutMfa()
  @Throttle({ default: { limit: lim(3), ttl: 60_000 } })
  @Mutation(() => Boolean)
  sendTestNotification(@CurrentActor() actor: Actor) {
    return this.notifications.sendTest(actor);
  }
  @AllowWithoutMfa()
  @Mutation(() => Boolean)
  registerPushToken(@CurrentActor() actor: Actor, @Args('token') token: string, @Args('platform') platform: string, @Args('installationId') installationId: string) {
    return this.push.register(actor, token, platform, installationId);
  }
  @AllowWithoutMfa()
  @Mutation(() => Boolean)
  unregisterPushToken(@CurrentActor() actor: Actor, @Args('installationId') installationId: string) {
    return this.push.unregister(actor, installationId);
  }
}

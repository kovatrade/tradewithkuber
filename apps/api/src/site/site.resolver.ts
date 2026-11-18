import { Args, Field, ID, InputType, Mutation, ObjectType, Query, Resolver } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Actor, GqlContext } from '../common/context';
import { Ctx, CurrentActor, lim, Public, Roles } from '../common/context';
import { badInput } from '../common/errors';
import { ENQUIRY_STATUSES, type EnquiryStatus, SiteService } from './site.service';

@ObjectType()
class CourseModule {
  @Field() title: string;
  @Field(() => [String]) topics: string[];
}

@ObjectType({ description: 'A course on the public website (from configuration key site.courses).' })
class Course {
  @Field() slug: string;
  @Field() title: string;
  @Field() level: string;
  @Field() duration: string;
  @Field({ description: 'Whole rupees, e.g. "4999"; "0" = free.' }) fee: string;
  @Field() format: string;
  @Field() summary: string;
  @Field(() => [String]) outcomes: string[];
  @Field(() => [CourseModule]) modules: CourseModule[];
}

@InputType()
class CourseEnquiryInput {
  @Field() @IsString() @MaxLength(80, { message: 'Name: up to 80 characters.' }) name: string;
  @Field() @IsString() @MaxLength(30) phone: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(254) email?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(80) courseSlug?: string;
  @Field({ nullable: true }) @IsOptional() @IsString() @MaxLength(1000, { message: 'Message: up to 1000 characters.' }) message?: string;
  @Field({ nullable: true, description: 'Must stay empty (spam trap).' }) @IsOptional() @IsString() @MaxLength(500) website?: string;
}

@ObjectType()
class CourseEnquiry {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() phone: string;
  @Field({ nullable: true }) email?: string;
  @Field({ nullable: true }) courseSlug?: string;
  @Field({ nullable: true }) message?: string;
  @Field() status: string;
  @Field({ nullable: true }) note?: string;
  @Field({ nullable: true }) handledAt?: Date;
  @Field() createdAt: Date;
}

const toEnquiry = (r: { id: string; name: string; phone: string; email: string | null; courseSlug: string | null; message: string | null; status: string; note: string | null; handledAt: Date | null; createdAt: Date }): CourseEnquiry => ({
  id: r.id, name: r.name, phone: r.phone, email: r.email ?? undefined, courseSlug: r.courseSlug ?? undefined, message: r.message ?? undefined,
  status: r.status, note: r.note ?? undefined, handledAt: r.handledAt ?? undefined, createdAt: r.createdAt,
});
const asStatus = (s: string): EnquiryStatus => {
  if (!(ENQUIRY_STATUSES as readonly string[]).includes(s)) throw badInput('Unknown status.');
  return s as EnquiryStatus;
};

@ObjectType()
class BrokerExchange { @Field() name: string; @Field() memberId: string; }
@ObjectType()
class BrokerFees { @Field() delivery: string; @Field() intraday: string; @Field() fo: string; @Field() accountOpening: string; }
@ObjectType({ description: 'Broker website settings (public regulatory disclosures).' })
class SiteBroker {
  @Field({ description: 'off | preview | live' }) mode: string;
  @Field() legalName: string;
  @Field() sebiRegNo: string;
  @Field() dpRegNo: string;
  @Field() cin: string;
  @Field(() => [BrokerExchange]) exchanges: BrokerExchange[];
  @Field() address: string;
  @Field() complianceEmail: string;
  @Field() grievanceEmail: string;
  @Field(() => [String]) offerings: string[];
  @Field(() => [String]) accountTypes: string[];
  @Field(() => BrokerFees) brokerage: BrokerFees;
}

@Resolver()
export class SiteResolver {
  constructor(private readonly site: SiteService) {}

  @Public()
  @Throttle({ default: { limit: lim(60), ttl: 60_000 } })
  @Query(() => [Course], { description: 'Courses on the public website.' })
  async siteCourses() {
    return this.site.courses();
  }

  @Public()
  @Throttle({ default: { limit: lim(60), ttl: 60_000 } })
  @Query(() => SiteBroker, { description: 'Broker website mode and disclosures.' })
  async siteBroker() {
    return this.site.broker();
  }

  @Public()
  @Throttle({ default: { limit: lim(3), ttl: 60_000 } })
  @Mutation(() => Boolean, { description: 'Public "Enroll / Call me" form. A Super Admin sees it under Course enquiries.' })
  async submitCourseEnquiry(@Args('input') input: CourseEnquiryInput, @Ctx() c: GqlContext) {
    if (input.website) return true; // spam trap: pretend it worked
    await this.site.submitEnquiry(input, c.ip);
    return true;
  }

  @Roles('SUPER_ADMIN', 'DEVELOPER')
  @Query(() => [CourseEnquiry])
  async courseEnquiries(@Args('status', { type: () => String, nullable: true }) status?: string | null) {
    return (await this.site.listEnquiries(status ? asStatus(status) : null)).map(toEnquiry);
  }

  @Roles('SUPER_ADMIN', 'DEVELOPER')
  @Mutation(() => CourseEnquiry)
  async setCourseEnquiryStatus(@CurrentActor() a: Actor, @Args('id', { type: () => ID }) id: string, @Args('status') status: string, @Args('note', { type: () => String, nullable: true }) note: string | null, @Ctx() c: GqlContext) {
    return toEnquiry(await this.site.setStatus(a, id, asStatus(status), note, c.ip));
  }
}

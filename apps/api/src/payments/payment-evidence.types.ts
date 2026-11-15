import { Field, ID, InputType, ObjectType } from '@nestjs/graphql';
import { IsISO8601, IsString, IsUUID, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { UTR_RE, UTR_HINT } from '../common/payment-reference';

@InputType()
export class PaymentEvidenceInput {
  @Field(() => ID) @IsUUID('all') payeeAccountId: string;
  @Field()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(UTR_RE, { message: UTR_HINT })
  utr: string;
  @Field() @Length(2, 120) payerName: string;
  @Field() @IsISO8601({ strict: true }) paidAt: string;
  @Field() @IsString() @Length(1, 800_000, { message: 'Attach a payment screenshot (JPG, PNG or WebP, max 550 kB).' }) proof: string;
}

@ObjectType()
export class PaymentEvidence {
  @Field(() => ID) id: string;
  @Field(() => ID) userId: string;
  @Field(() => ID, { nullable: true }) paymentRequestId?: string;
  @Field(() => ID) payeeAccountId: string;
  @Field() payee: string;
  @Field() accountName: string;
  @Field({ nullable: true }) bankName?: string;
  @Field({ nullable: true }) accountNumber?: string;
  @Field({ nullable: true }) ifsc?: string;
  @Field({ nullable: true }) branch?: string;
  @Field({ nullable: true }) upiId?: string;
  @Field() amount: string;
  @Field() utr: string;
  @Field() payerName: string;
  @Field() paidAt: Date;
  @Field() hasProof: boolean;
  @Field() createdAt: Date;
}

import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/context';
import { badInput, notFound } from '../common/errors';
import { decryptField, encryptField } from '../common/crypto';
import { normalizeEmail, normalizePhone } from '../common/pii';
import { ConfigService } from '../config-mgmt/config.service';
import { DbService } from '../db/db';
import { courseEnquiries, users } from '../db/schema';
import { NotificationsService } from '../notifications/notifications.service';

export const ENQUIRY_STATUSES = ['NEW', 'CONTACTED', 'ENROLLED', 'CLOSED'] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

/** Public course website: course list (from configuration) and enquiries. */
@Injectable()
export class SiteService {
  constructor(
    private readonly dbs: DbService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  courses() {
    return this.config.get('site.courses');
  }

  broker() {
    return this.config.get('site.broker');
  }

  async submitEnquiry(input: { name: string; phone: string; email?: string | null; courseSlug?: string | null; message?: string | null }, ip: string) {
    if (!(await this.config.get('site.enquiriesOpen'))) throw badInput('Enquiries are closed right now. Please try again later.');
    const name = input.name.trim().replace(/\s+/g, ' ');
    if (name.length < 2 || name.length > 80) throw badInput('Please enter your name.');
    let phone: string;
    try { phone = normalizePhone(input.phone); } catch { throw badInput('Please enter a valid 10-digit mobile number.'); }
    let email: string | null = null;
    if (input.email?.trim()) {
      try { email = normalizeEmail(input.email); } catch { throw badInput('Please enter a valid email address, or leave it empty.'); }
    }
    const message = input.message?.trim().slice(0, 1000) || null;
    const courses = await this.courses();
    const course = input.courseSlug ? courses.find((c) => c.slug === input.courseSlug) : undefined;
    if (input.courseSlug && !course) throw badInput('That course is not available.');
    return this.dbs.db.transaction(async (tx) => {
      const [row] = await tx.insert(courseEnquiries).values({ name, phoneEnc: encryptField(phone, 'course_enquiries.phone'), emailEnc: email ? encryptField(email, 'course_enquiries.email') : null, courseSlug: course?.slug ?? null, message, ip: ip.slice(0, 64) }).returning({ id: courseEnquiries.id });
      const admins = await tx.select({ id: users.id }).from(users).where(and(inArray(users.role, ['SUPER_ADMIN', 'DEVELOPER']), eq(users.status, 'ACTIVE')));
      for (const a of admins) await this.notifications.notify(tx, a.id, 'site.enquiry', 'New course enquiry', `${name}${course ? ` · ${course.title}` : ''}. Open Course enquiries to call back.`);
      await this.audit.record(tx, { actor: null, action: 'site.enquiry_received', entityType: 'course_enquiry', entityId: row.id, outcome: 'SUCCESS', ip, metadata: { course: course?.slug ?? null } });
      return row.id;
    });
  }

  async listEnquiries(status?: EnquiryStatus | null) {
    const rows = await this.dbs.db.select().from(courseEnquiries)
      .where(status ? eq(courseEnquiries.status, status) : inArray(courseEnquiries.status, [...ENQUIRY_STATUSES]))
      .orderBy(desc(courseEnquiries.createdAt)).limit(500);
    return rows.map((r) => ({ ...r, phone: decryptField(r.phoneEnc, 'course_enquiries.phone'), email: r.emailEnc ? decryptField(r.emailEnc, 'course_enquiries.email') : null }));
  }

  async setStatus(actor: Actor, id: string, status: EnquiryStatus, note: string | null, ip: string) {
    return this.dbs.db.transaction(async (tx) => {
      const [r] = await tx.select().from(courseEnquiries).where(eq(courseEnquiries.id, id)).for('update');
      if (!r) throw notFound('Enquiry');
      const [u] = await tx.update(courseEnquiries).set({ status, note: note?.trim().slice(0, 500) || r.note, handledById: actor.userId, handledAt: new Date() }).where(eq(courseEnquiries.id, id)).returning();
      await this.audit.record(tx, { actor, action: 'site.enquiry_status', entityType: 'course_enquiry', entityId: id, outcome: 'SUCCESS', ip, metadata: { from: r.status, to: status } });
      return { ...u, phone: decryptField(u.phoneEnc, 'course_enquiries.phone'), email: u.emailEnc ? decryptField(u.emailEnc, 'course_enquiries.email') : null };
    });
  }
}

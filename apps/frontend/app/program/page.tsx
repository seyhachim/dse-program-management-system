import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Code2,
  GraduationCap,
  Mail,
  Menu,
  Target,
} from "lucide-react";
import { loadPublicProgrammePage } from "@/lib/public-programme-live";
import { ProgrammeThemeToggle } from "./program-theme-toggle";
import styles from "./program.module.css";

export const metadata: Metadata = {
  title: "Data Science & Engineering | RUPP",
  description:
    "Discover the Data Science & Engineering programme at the Faculty of Engineering, RUPP.",
};

const snapshotIcons = [CalendarDays, BookOpen, GraduationCap, BriefcaseBusiness] as const;

const benefitItems = [
  { label: "Applied problem solving", icon: Target },
  { label: "Hands-on learning", icon: Code2 },
  { label: "Professional practice", icon: BriefcaseBusiness },
] as const;

function formatPublicDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export default async function ProgrammePage() {
  const content = await loadPublicProgrammePage();
  const applicationUrl = content.contact?.applicationUrl;
  const hasFaqs = content.faqs.length > 0;
  const hasDates = content.importantDates.length > 0;
  const hasContact = Boolean(content.contact);
  const hasUtilityContent = hasFaqs || hasDates || hasContact;

  const snapshot =
    content.sectionSources.snapshot === "curated-fallback"
      ? content.snapshot.filter((item) => item.label !== "Curriculum snapshot").slice(0, 4)
      : content.snapshot.slice(0, 4);

  const officialCourses = content.curriculumPreview.isOfficialPublishedCurriculum
    ? content.curriculumPreview.semesters.flatMap((semester) => semester.courses).slice(0, 4)
    : [];

  const curriculumHighlights =
    officialCourses.length > 0
      ? officialCourses.map((course) => `${course.code} · ${course.title}`)
      : content.learningThemes.slice(0, 4).map((theme) => theme.title);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={`${styles.shell} ${styles.nav}`}>
          <Link href="/program" className={styles.brand} aria-label="DSE programme home">
            <span className={styles.logoLockup} aria-hidden="true">
              <span className={styles.ruppMark}>
                <img src="/rupp-logo.png" alt="" />
              </span>
              <img src="/dse-logo.svg" alt="" className={styles.dseLogo} />
            </span>
            <span className={styles.brandText}>
              <strong>Royal University of Phnom Penh</strong>
              <small>Faculty of Engineering</small>
            </span>
          </Link>

          <nav className={styles.navLinks} aria-label="Public programme navigation">
            <a href="#programme">Programme</a>
            <a href="#curriculum">Curriculum</a>
            {hasFaqs && <a href="#faq">FAQ</a>}
            {hasDates && <a href="#dates">Dates</a>}
            {hasContact && <a href="#contact">Contact</a>}
          </nav>

          <div className={styles.navActions}>
            <ProgrammeThemeToggle className={styles.themeToggle} />
            <Link href="/login" className={styles.loginButton}>
              PMS Login
            </Link>
            <details className={styles.mobileMenu}>
              <summary aria-label="Open programme navigation">
                <Menu aria-hidden="true" />
              </summary>
              <nav aria-label="Mobile programme navigation">
                <a href="#programme">Programme</a>
                <a href="#curriculum">Curriculum</a>
                {hasFaqs && <a href="#faq">FAQ</a>}
                {hasDates && <a href="#dates">Dates</a>}
                {hasContact && <a href="#contact">Contact</a>}
                <Link href="/login">PMS Login</Link>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <section className={`${styles.hero} ${styles.shell}`} id="programme">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>DSE Bachelor Programme</p>
          <h1>{content.hero.title}</h1>
          <p className={styles.tagline}>{content.hero.tagline}</p>
          <p className={styles.lead}>{content.hero.description}</p>

          <div className={styles.heroActions}>
            <a href="#curriculum" className={styles.primaryButton}>
              Explore Curriculum <ArrowRight aria-hidden="true" />
            </a>
            {applicationUrl ? (
              <a href={applicationUrl} className={styles.secondaryButton}>
                Apply Now <ArrowRight aria-hidden="true" />
              </a>
            ) : (
              <a href="#contact" className={styles.secondaryButton}>
                Contact DSE <ArrowRight aria-hidden="true" />
              </a>
            )}
          </div>

          <div className={styles.benefits} aria-label="Programme highlights">
            {benefitItems.map(({ label, icon: Icon }) => (
              <span key={label}>
                <Icon aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>
        </div>
        <div className={styles.heroImage} aria-hidden="true" />
      </section>

      {snapshot.length > 0 && (
        <section className={`${styles.snapshot} ${styles.shell}`} aria-label="Programme at a glance">
          {snapshot.map((item, index) => {
            const Icon = snapshotIcons[index] ?? BookOpen;
            return (
              <div className={styles.stat} key={item.label}>
                <Icon aria-hidden="true" />
                <div>
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className={`${styles.mainCards} ${styles.shell}`} aria-label="Programme highlights">
        <article className={styles.infoCard}>
          <div className={styles.cardIcon}>
            <BookOpen aria-hidden="true" />
          </div>
          <div>
            <p className={styles.cardLabel}>Programme Overview</p>
            <h2>Built around data, computing and engineering.</h2>
            <p>{content.hero.description}</p>
          </div>
        </article>

        <article className={styles.infoCard} id="curriculum">
          <div className={styles.cardIcon}>
            <GraduationCap aria-hidden="true" />
          </div>
          <div>
            <div className={styles.cardHeadingRow}>
              <p className={styles.cardLabel}>Curriculum Highlights</p>
              <span className={styles.sourceBadge}>{content.curriculumPreview.sourceBadge}</span>
            </div>
            <h2>
              {content.curriculumPreview.isOfficialPublishedCurriculum
                ? "A concise view of the published curriculum."
                : "Core learning areas at a glance."}
            </h2>
            <ul className={styles.checkList}>
              {curriculumHighlights.map((item) => (
                <li key={item}>
                  <Check aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {content.curriculumPreview.isOfficialPublishedCurriculum && (
              <p className={styles.dataNote}>{content.curriculumPreview.note}</p>
            )}
          </div>
        </article>

        <article className={styles.infoCard}>
          <div className={styles.cardIcon}>
            <Target aria-hidden="true" />
          </div>
          <div>
            <p className={styles.cardLabel}>Learning Experience</p>
            <h2>Learn through practice, not just theory.</h2>
            <ul className={styles.checkList}>
              {content.practice.slice(0, 4).map((item) => (
                <li key={item.title}>
                  <Check aria-hidden="true" />
                  <span>{item.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </section>

      {hasUtilityContent && (
        <section className={`${styles.utilityStrip} ${styles.shell}`} aria-label="Programme information">
          {hasFaqs && (
            <article id="faq">
              <div className={styles.utilityIcon}>
                <BookOpen aria-hidden="true" />
              </div>
              <div>
                <p className={styles.cardLabel}>Frequently Asked Questions</p>
                <h2>{content.faqs[0]?.question}</h2>
                <p>{content.faqs[0]?.answer}</p>
                {content.faqs[1] && (
                  <details className={styles.inlineFaq}>
                    <summary>{content.faqs[1].question}</summary>
                    <p>{content.faqs[1].answer}</p>
                  </details>
                )}
              </div>
            </article>
          )}

          {hasDates && (
            <article id="dates">
              <div className={styles.utilityIcon}>
                <CalendarDays aria-hidden="true" />
              </div>
              <div>
                <p className={styles.cardLabel}>Important Dates</p>
                {content.importantDates.slice(0, 2).map((item) => (
                  <div className={styles.dateItem} key={`${item.kind}-${item.date}-${item.title}`}>
                    <strong>{item.title}</strong>
                    <span>
                      {formatPublicDate(item.date)}
                      {item.endDate ? ` – ${formatPublicDate(item.endDate)}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </article>
          )}

          {content.contact && (
            <article id="contact">
              <div className={styles.utilityIcon}>
                <Mail aria-hidden="true" />
              </div>
              <div>
                <p className={styles.cardLabel}>Contact DSE</p>
                <h2>Have a question? We’re here to help.</h2>
                <div className={styles.contactLinks}>
                  {content.contact.admissionEmail && (
                    <a href={`mailto:${content.contact.admissionEmail}`}>{content.contact.admissionEmail}</a>
                  )}
                  {content.contact.phone && (
                    <a href={`tel:${content.contact.phone.replace(/\s+/g, "")}`}>{content.contact.phone}</a>
                  )}
                </div>
              </div>
            </article>
          )}
        </section>
      )}

      <footer className={styles.footer}>
        <div className={`${styles.shell} ${styles.footerInner}`}>
          <div>
            <strong>DSE · Faculty of Engineering</strong>
            <span>Royal University of Phnom Penh</span>
          </div>
          <nav aria-label="Footer navigation">
            <a href="#programme">Programme</a>
            <a href="#curriculum">Curriculum</a>
            {hasFaqs && <a href="#faq">FAQ</a>}
            <Link href="/login">PMS Login</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

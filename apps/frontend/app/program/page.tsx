import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  Beaker,
  BookOpen,
  BrainCircuit,
  BriefcaseBusiness,
  CalendarDays,
  Code2,
  Database,
  GraduationCap,
  Lightbulb,
  Menu,
  Rocket,
  Shapes,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { loadPublicProgrammePage } from "@/lib/public-programme-live";
import fixes from "./program-fixes.module.css";
import styles from "./program.module.css";

export const metadata: Metadata = {
  title: "Data Science & Engineering | RUPP",
  description:
    "Discover the Data Science & Engineering programme at the Faculty of Engineering, RUPP.",
};

const learningIcons = {
  chart: BarChart3,
  code: Code2,
  brain: BrainCircuit,
  database: Database,
  idea: Lightbulb,
  people: UsersRound,
} as const;

const practiceIcons = {
  project: Code2,
  lab: Beaker,
  practicum: BriefcaseBusiness,
  internship: Shapes,
  capstone: Rocket,
} as const;

const snapshotIcons = [CalendarDays, GraduationCap, BookOpen, GraduationCap] as const;

function formatPublicDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function categoryLabel(category: string): string {
  return category
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace("Fees Scholarships", "Fees & Scholarships");
}

export default async function ProgrammePage() {
  const content = await loadPublicProgrammePage();
  const applicationUrl = content.contact?.applicationUrl;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.shell}>
          <nav className={styles.nav} aria-label="Public programme navigation">
            <Link href="/program" className={styles.brand} aria-label="DSE Programme home">
              <span>DSE</span>
              <small>Programme</small>
            </Link>
            <div className={styles.navLinks}>
              <a href="#programme">Programme</a>
              <a href="#curriculum">Curriculum</a>
              <a href="#learning">Outcomes</a>
              <a href="#practice">Experience</a>
              {content.faqs.length > 0 && <a href="#faq">FAQ</a>}
              <a href="#stories">News</a>
            </div>
            <div className={styles.navActions}>
              <Link href="/login" className={`${styles.loginButton} ${fixes.mobileLogin}`}>
                PMS Login
              </Link>
              <details className={fixes.mobileMenu}>
                <summary aria-label="Open programme navigation">
                  <Menu aria-hidden="true" />
                </summary>
                <nav aria-label="Mobile programme navigation">
                  <a href="#programme">Programme</a>
                  <a href="#curriculum">Curriculum</a>
                  <a href="#learning">Outcomes</a>
                  <a href="#practice">Experience</a>
                  {content.faqs.length > 0 && <a href="#faq">FAQ</a>}
                  <a href="#stories">News</a>
                </nav>
              </details>
            </div>
          </nav>
        </div>
      </header>

      <section className={`${styles.hero} ${styles.shell}`} id="programme">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{content.hero.eyebrow}</p>
          <h1>{content.hero.title}</h1>
          <p className={styles.tagline}>{content.hero.tagline}</p>
          <p className={styles.lead}>{content.hero.description}</p>
          <div className={styles.heroActions}>
            <a href="#curriculum" className={styles.primaryButton}>
              Explore Curriculum <span aria-hidden="true">→</span>
            </a>
            {applicationUrl ? (
              <a href={applicationUrl} className={styles.secondaryButton}>
                Apply to DSE
              </a>
            ) : (
              <a href="#learning" className={styles.secondaryButton}>
                Discover DSE
              </a>
            )}
          </div>
        </div>
        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.orbit} />
          <div className={styles.globe} />
          <div className={styles.chartBars}>
            {[38, 62, 46, 78, 92].map((height, index) => (
              <span key={index} style={{ height: `${height}%` }} />
            ))}
          </div>
          <div className={styles.ring} />
          <Sparkles className={styles.sparkle} />
        </div>
      </section>

      <section className={`${styles.snapshot} ${styles.shell}`} aria-label="Programme at a glance">
        {content.snapshot.map((item, index) => {
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

      <section className={`${styles.section} ${styles.shell}`} id="learning">
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}>Programme outcomes</p>
          <h2>What you will learn</h2>
          <p>Strong technical foundations, applied engineering judgement and responsible professional practice.</p>
        </div>
        <div className={styles.learningGrid}>
          {content.learningThemes.map((theme) => {
            const Icon = learningIcons[theme.icon];
            return (
              <article className={styles.learningItem} key={theme.title}>
                <Icon aria-hidden="true" />
                <div>
                  <h3>{theme.title}</h3>
                  <p>{theme.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.curriculumSection} id="curriculum">
        <div className={`${styles.section} ${styles.shell}`}>
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>Four-year progression</p>
            <h2>Your DSE journey</h2>
            <p>Move from foundations to advanced applied study, industry experience and capstone work.</p>
          </div>

          <ol className={styles.journey}>
            {content.journey.map((step, index) => (
              <li key={step.year}>
                <span>{index + 1}</span>
                <strong>{step.year}</strong>
                <small>{step.label}</small>
              </li>
            ))}
          </ol>

          <div className={styles.curriculumPreview}>
            <div className={styles.previewHeader}>
              <div>
                <p className={styles.kicker}>{content.curriculumPreview.heading}</p>
                <h3>Start with the foundations</h3>
              </div>
              <span className={styles.sourceBadge}>{content.curriculumPreview.sourceBadge}</span>
            </div>
            <div className={styles.semesters}>
              {content.curriculumPreview.semesters.map((semester) => (
                <article key={semester.title}>
                  <h4>{semester.title}</h4>
                  {semester.courses.length > 0 ? (
                    <ul>
                      {semester.courses.map((course) => (
                        <li key={course.code}>
                          <span>{course.title}</span>
                          <code>{course.code}</code>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.previewNote}>
                      No courses are currently published for this semester.
                    </p>
                  )}
                </article>
              ))}
            </div>
            <p className={styles.previewNote}>{content.curriculumPreview.note}</p>
            <a href="#programme" className={styles.secondaryButton}>
              View programme overview <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.shell}`} id="practice">
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}>Learn by doing</p>
          <h2>Learning through practice</h2>
        </div>
        <div className={styles.practiceGrid}>
          {content.practice.map((item) => {
            const Icon = practiceIcons[item.icon];
            return (
              <article key={item.title}>
                <Icon aria-hidden="true" />
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.careersSection}>
        <div className={`${styles.shell} ${styles.careersInner}`}>
          <div>
            <p className={styles.kicker}>Career pathways</p>
            <h2>Where DSE can take you</h2>
          </div>
          <div className={styles.careerList}>
            {content.careers.map((career) => (
              <span key={career}>{career}</span>
            ))}
          </div>
        </div>
      </section>

      {content.faqs.length > 0 && (
        <section className={`${styles.section} ${styles.shell}`} id="faq">
          <div className={styles.sectionHeading}>
            <p className={styles.kicker}>Published programme information</p>
            <h2>Frequently asked questions</h2>
            <p>Official answers maintained and published by the DSE programme.</p>
          </div>
          <div className={styles.storyGrid}>
            {content.faqs.map((faq) => (
              <article key={faq.slug}>
                <div>
                  <small>{categoryLabel(faq.category)}</small>
                  <h3>{faq.question}</h3>
                  <p>{faq.answer}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {content.importantDates.length > 0 && (
        <section className={styles.curriculumSection} id="dates">
          <div className={`${styles.section} ${styles.shell}`}>
            <div className={styles.sectionHeading}>
              <p className={styles.kicker}>Published schedule</p>
              <h2>Important dates</h2>
              <p>Current dates published by the DSE programme.</p>
            </div>
            <div className={styles.storyGrid}>
              {content.importantDates.map((item) => (
                <article key={`${item.kind}-${item.date}-${item.title}`}>
                  <div>
                    <small>{categoryLabel(item.kind)}</small>
                    <h3>{item.title}</h3>
                    <p>
                      {formatPublicDate(item.date)}
                      {item.endDate ? ` – ${formatPublicDate(item.endDate)}` : ""}
                    </p>
                    {item.description && <p>{item.description}</p>}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {content.contact && (
        <section className={styles.careersSection} id="contact">
          <div className={`${styles.shell} ${styles.careersInner}`}>
            <div>
              <p className={styles.kicker}>Published contact information</p>
              <h2>Contact DSE</h2>
              {content.contact.campusAddress && <p>{content.contact.campusAddress}</p>}
            </div>
            <div className={styles.heroActions}>
              {content.contact.admissionEmail && (
                <a href={`mailto:${content.contact.admissionEmail}`} className={styles.secondaryButton}>
                  Email admissions
                </a>
              )}
              {content.contact.phone && (
                <a href={`tel:${content.contact.phone.replace(/\s+/g, "")}`} className={styles.secondaryButton}>
                  Call DSE
                </a>
              )}
              {content.contact.websiteUrl && (
                <a href={content.contact.websiteUrl} className={styles.secondaryButton}>
                  DSE website
                </a>
              )}
              {content.contact.facebookUrl && (
                <a href={content.contact.facebookUrl} className={styles.secondaryButton}>
                  Facebook
                </a>
              )}
              {applicationUrl && (
                <a href={applicationUrl} className={styles.primaryButton}>
                  Apply to DSE
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      <section className={`${styles.section} ${styles.shell}`} id="stories">
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}>Programme life</p>
          <h2>Latest from DSE</h2>
          <p>Highlights from projects, learning experiences and the DSE community.</p>
        </div>
        <div className={styles.storyGrid}>
          {content.stories.map((story, index) => (
            <article key={story.title}>
              <div className={styles.storyVisual} aria-hidden="true">
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div>
                <small>{story.category}</small>
                <h3>{story.title}</h3>
                <p>{story.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.shell} ${styles.footerInner}`}>
          <div>
            <strong>DSE</strong>
            <span>Faculty of Engineering · RUPP</span>
          </div>
          <nav aria-label="Footer navigation">
            <a href="#programme">Programme</a>
            <a href="#curriculum">Curriculum</a>
            <a href="#learning">Outcomes</a>
            {content.faqs.length > 0 && <a href="#faq">FAQ</a>}
            <Link href="/login">PMS Login</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}

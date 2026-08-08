-- Additive programme-level profile data for the required Course Specification Part 1.
-- Existing course, CLO, PLO, competency, and policy data is preserved.
CREATE TABLE "ProgrammeProfile" (
    "id" TEXT NOT NULL DEFAULT 'dse',
    "vision" TEXT NOT NULL DEFAULT '',
    "mission" JSONB NOT NULL DEFAULT '[]',
    "goals" JSONB NOT NULL DEFAULT '[]',
    "educationalPhilosophy" JSONB NOT NULL DEFAULT '[]',
    "peos" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgrammeProfile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProgrammeProfile" ENABLE ROW LEVEL SECURITY;

-- Seed only the new singleton row. Existing application data is untouched.
INSERT INTO "ProgrammeProfile" (
    "id", "vision", "mission", "goals", "educationalPhilosophy", "peos", "updatedAt"
) VALUES (
    'dse',
    'To be a leading program in Data Science and Engineering in Cambodia with regional recognition for excellence in education, research, and innovation that drives digital transformation and societal development',
    $$["Empower students with strong foundations in data science, engineering, and digital technologies, along with critical thinking, ethics, and problem-solving skills","Advance knowledge and innovation through high-quality research in data science, artificial intelligence, and emerging technologies that address local and regional challenges","Engage with industry and society by applying data-driven solutions to real-world problems, fostering collaboration, and contributing to Cambodia’s digital economy and sustainable development"]$$::jsonb,
    $$["Develop skilled graduates with strong foundations in data science and engineering.","Foster innovation, research, and problem-solving in AI and emerging technologies.","Promote ethical, responsible, and professional practice.","Strengthen collaboration with industry and society for digital transformation.","Cultivate leadership, adaptability, and lifelong learning."]$$::jsonb,
    $$[{"code":"EP1","title":"Critical Thinking and Data-Driven Decision Making","description":"Develop graduates who apply critical thinking, logical reasoning, and data-driven approaches to solve complex real-world problems and support informed decision-making."},{"code":"EP2","title":"Research, Innovation, and Computational Intelligence","description":"Foster strong capacity in research, innovation, and the use of computational methods, AI, and data science techniques to generate new knowledge and solutions."},{"code":"EP3","title":"Professional Practice and Industry Readiness","description":"Prepare graduates with strong technical competence, digital literacy, and professional skills to meet evolving industry and employability demands."},{"code":"EP4","title":"Societal and Regional Responsiveness","description":"Equip graduates to design data-driven solutions that address societal challenges and respond to regional development needs in Cambodia and ASEAN."},{"code":"EP5","title":"Intercultural Competence and Responsible Citizenship","description":"Promote intercultural understanding, teamwork, and responsible citizenship."},{"code":"EP6","title":"National Development, Sustainability, and Digital Transformation","description":"Encourage graduates to contribute to national development, cultural and environmental sustainability, and digital transformation through innovative data science and engineering solutions."}]$$::jsonb,
    $$[{"code":"PEO1","title":"Professional Practice","description":"Graduates will become competent professionals in data science and engineering, applying digital and analytical skills in diverse industries."},{"code":"PEO2","title":"Innovation & Problem Solving","description":"Graduates will demonstrate innovation, critical thinking, and problem-solving skills to design and implement data-driven solutions to real-world challenges."},{"code":"PEO3","title":"Communication & Collaboration","description":"Graduates will effectively collaborate and communicate with interdisciplinary teams and stakeholders in both local and international contexts."},{"code":"PEO4","title":"Ethics & Social Responsibility","description":"Graduates will practice with professionalism, ethics, and a commitment to social and environmental responsibility."},{"code":"PEO5","title":"Lifelong Learning & Leadership","description":"Graduates will pursue continuous learning, certifications, or advanced degrees and assume leadership roles in the digital economy."}]$$::jsonb,
    CURRENT_TIMESTAMP
);

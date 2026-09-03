import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Vaziro database seeding...');

  // 1. Roles
  const roles = [
    { name: 'CUSTOMER', description: 'Individual or family seeking verified service professionals' },
    { name: 'PROFESSIONAL', description: 'Independent service professional or service agency partner' },
    { name: 'ADMIN', description: 'Platform operator with catalog and governance access' },
    { name: 'SUPER_ADMIN', description: 'Executive level system administrator with full access' },
    { name: 'SUPPORT', description: 'Customer support agent for dispute and chat arbitration' },
    { name: 'FINANCE', description: 'Finance administrator for payouts, fees, and GST tax auditing' },
    { name: 'VERIFICATION_ADMIN', description: 'Compliance officer for DigiLocker and KYC verification' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }
  console.log('✅ Roles seeded successfully');

  // 2. Indian Location Hierarchy (State -> City -> Area -> Pincode)
  const statesData = [
    {
      name: 'Karnataka',
      code: 'KA',
      cities: [
        {
          name: 'Bengaluru',
          slug: 'bengaluru',
          areas: [
            { name: 'Indiranagar', locality: 'East Bengaluru', pincodes: [{ pincode: '560038', lat: 12.9784, lng: 77.6408 }] },
            { name: 'Koramangala', locality: 'South Bengaluru', pincodes: [{ pincode: '560034', lat: 12.9352, lng: 77.6245 }] },
            { name: 'HSR Layout', locality: 'South-East Bengaluru', pincodes: [{ pincode: '560102', lat: 12.9121, lng: 77.6446 }] },
            { name: 'Whitefield', locality: 'East Bengaluru', pincodes: [{ pincode: '560066', lat: 12.9698, lng: 77.7500 }] },
          ],
        },
      ],
    },
    {
      name: 'Maharashtra',
      code: 'MH',
      cities: [
        {
          name: 'Mumbai',
          slug: 'mumbai',
          areas: [
            { name: 'Bandra West', locality: 'Western Suburbs', pincodes: [{ pincode: '400050', lat: 19.0596, lng: 72.8295 }] },
            { name: 'Andheri West', locality: 'Western Suburbs', pincodes: [{ pincode: '400058', lat: 19.1197, lng: 72.8464 }] },
            { name: 'Powai', locality: 'Central Suburbs', pincodes: [{ pincode: '400076', lat: 19.1176, lng: 72.9060 }] },
          ],
        },
        {
          name: 'Pune',
          slug: 'pune',
          areas: [
            { name: 'Kothrud', locality: 'West Pune', pincodes: [{ pincode: '411038', lat: 18.5074, lng: 73.8077 }] },
            { name: 'Viman Nagar', locality: 'East Pune', pincodes: [{ pincode: '411014', lat: 18.5679, lng: 73.9143 }] },
          ],
        },
      ],
    },
    {
      name: 'Delhi NCR',
      code: 'DL',
      cities: [
        {
          name: 'New Delhi',
          slug: 'new-delhi',
          areas: [
            { name: 'Connaught Place', locality: 'Central Delhi', pincodes: [{ pincode: '110001', lat: 28.6315, lng: 77.2167 }] },
            { name: 'Hauz Khas', locality: 'South Delhi', pincodes: [{ pincode: '110016', lat: 28.5494, lng: 77.2001 }] },
          ],
        },
      ],
    },
    {
      name: 'Telangana',
      code: 'TS',
      cities: [
        {
          name: 'Hyderabad',
          slug: 'hyderabad',
          areas: [
            { name: 'Hitec City', locality: 'Madhapur', pincodes: [{ pincode: '500081', lat: 17.4474, lng: 78.3762 }] },
            { name: 'Jubilee Hills', locality: 'Central Hyderabad', pincodes: [{ pincode: '500033', lat: 17.4319, lng: 78.4073 }] },
          ],
        },
      ],
    },
  ];

  for (const s of statesData) {
    const state = await prisma.state.upsert({
      where: { code: s.code },
      update: { name: s.name },
      create: { name: s.name, code: s.code, isActive: true },
    });

    for (const c of s.cities) {
      const city = await prisma.city.upsert({
        where: { slug: c.slug },
        update: { name: c.name, stateId: state.id },
        create: { name: c.name, slug: c.slug, stateId: state.id, isActive: true },
      });

      for (const a of c.areas) {
        let area = await prisma.area.findFirst({
          where: { cityId: city.id, name: a.name },
        });
        if (!area) {
          area = await prisma.area.create({
            data: { cityId: city.id, name: a.name, locality: a.locality, isActive: true },
          });
        }

        for (const p of a.pincodes) {
          await prisma.pincode.upsert({
            where: { pincode: p.pincode },
            update: { areaId: area.id, latitude: p.lat, longitude: p.lng },
            create: { areaId: area.id, pincode: p.pincode, latitude: p.lat, longitude: p.lng, isActive: true },
          });
        }
      }
    }
  }
  console.log('✅ Indian Location topology seeded (States, Cities, Areas, Pincodes)');

  // 3. Exact 8 Service Categories & 48 Subcategories (Section 8 & 9)
  const masterCategories = [
    {
      name: 'Elderly Caregiver',
      slug: 'elderly-caregiver',
      description: 'Compassionate, verified senior care, companion, and post-hospital care specialists',
      icon: 'HeartHandshake',
      subcategories: [
        'Full-Time Caregiver',
        'Part-Time Caregiver',
        'Live-In Caregiver',
        'Elderly Companion',
        'Dementia Care',
        'Post-Hospital Care',
      ],
    },
    {
      name: 'Fitness Trainer',
      slug: 'fitness-trainer',
      description: 'Certified personal trainers for home workouts, weight management, and strength conditioning',
      icon: 'Dumbbell',
      subcategories: [
        'Personal Trainer',
        'Weight Loss Trainer',
        'Strength Training',
        'Home Fitness',
        'Senior Fitness',
        'Sports Fitness',
      ],
    },
    {
      name: 'Home Cook / Chef',
      slug: 'home-cook-chef',
      description: 'Hygienic daily home cooks, gourmet private chefs, vegetarian, and specialized cuisines',
      icon: 'ChefHat',
      subcategories: [
        'Daily Home Cook',
        'Personal Chef',
        'Vegetarian Cook',
        'Non-Vegetarian Cook',
        'Party/Event Chef',
        'Specialized Cuisine',
      ],
    },
    {
      name: 'Home Nurse',
      slug: 'home-nurse',
      description: 'Registered medical nurses for clinical patient care, dressing, injections, and post-surgery care',
      icon: 'Cross',
      subcategories: [
        'General Nursing',
        'Post-Surgery Care',
        'Elderly Nursing',
        'Patient Care',
        'Injection/Dressing Support',
        'Night Nurse',
      ],
    },
    {
      name: 'Home Tutor',
      slug: 'home-tutor',
      description: 'Expert private home educators for school academics, competitive entrance exams, and STEM subjects',
      icon: 'GraduationCap',
      subcategories: [
        'School Tutor',
        'Mathematics',
        'Science',
        'English',
        'Competitive Exam',
        'Language Tutor',
        'Special Education',
      ],
    },
    {
      name: 'Nanny & Baby Care',
      slug: 'nanny-baby-care',
      description: 'Trusted, police-verified newborn nannies, babysitters, and child companions for peace of mind',
      icon: 'Baby',
      subcategories: [
        'Newborn Care',
        'Babysitter',
        'Full-Time Nanny',
        'Part-Time Nanny',
        'Child Companion',
        'Night Care',
      ],
    },
    {
      name: 'Physiotherapist',
      slug: 'physiotherapist',
      description: 'Licensed clinical physiotherapists providing home rehabilitation, pain relief, and sports recovery',
      icon: 'Activity',
      subcategories: [
        'Home Physiotherapy',
        'Post-Surgery Physiotherapy',
        'Sports Physiotherapy',
        'Elderly Physiotherapy',
        'Pain Management',
        'Rehabilitation',
      ],
    },
    {
      name: 'Yoga Instructor',
      slug: 'yoga-instructor',
      description: 'Certified yoga and meditation gurus for home sessions, prenatal yoga, and wellness therapy',
      icon: 'Sparkles',
      subcategories: [
        'Home Yoga',
        'Online Yoga',
        'Weight Loss Yoga',
        'Meditation',
        'Prenatal Yoga',
        'Senior Yoga',
      ],
    },
  ];

  for (const cat of masterCategories) {
    const category = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, description: cat.description, icon: cat.icon },
      create: {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        icon: cat.icon,
        isActive: true,
      },
    });

    for (const subName of cat.subcategories) {
      const subSlug = `${cat.slug}-${subName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      await prisma.subcategory.upsert({
        where: { slug: subSlug },
        update: { name: subName, categoryId: category.id },
        create: {
          name: subName,
          slug: subSlug,
          categoryId: category.id,
          isActive: true,
        },
      });
    }
  }
  console.log('✅ 8 Categories & 48 Subcategories seeded successfully');

  // 4. Credit Plans (Section 20)
  const creditPlans = [
    {
      name: 'FREE',
      price: 0.0,
      creditsCount: 0,
      perks: 'Standard directory visibility; Credits can be purchased separately.',
      isRecommended: false,
    },
    {
      name: 'STARTER',
      price: 999.0,
      creditsCount: 25,
      perks: 'Basic promotion badge; standard requirement alerts.',
      isRecommended: false,
    },
    {
      name: 'GROWTH',
      price: 1999.0,
      creditsCount: 55,
      perks: 'Better promotion; highlighted in quotations; 10% bonus value.',
      isRecommended: true,
    },
    {
      name: 'PRO',
      price: 2999.0,
      creditsCount: 90,
      perks: 'Advanced promotion; top search tier; priority customer introduction.',
      isRecommended: false,
    },
  ];

  for (const plan of creditPlans) {
    await prisma.creditPlan.upsert({
      where: { name: plan.name },
      update: { price: plan.price, creditsCount: plan.creditsCount, perks: plan.perks, isRecommended: plan.isRecommended },
      create: plan,
    });
  }
  console.log('✅ Credit Plans (FREE, STARTER, GROWTH, PRO) seeded');

  // 5. Configurable System Settings (Section 18, 19, 34, 47)
  const settings = [
    { key: 'application_fee_percentage', value: '5.0', type: 'NUMBER', description: 'Percentage of stated requirement budget used for application fee calculation' },
    { key: 'credit_value', value: '50.0', type: 'NUMBER', description: 'Nominal INR value of 1 credit for fee computations' },
    { key: 'minimum_application_credits', value: '1', type: 'NUMBER', description: 'Minimum credits required to apply to any requirement' },
    { key: 'maximum_application_credits', value: '100', type: 'NUMBER', description: 'Maximum credits cap for high-budget jobs' },
    { key: 'platform_fee_percentage', value: '6.0', type: 'NUMBER', description: 'Platform commission percentage deducted upon customer approval of completed job' },
    { key: 'payment_protection_enabled', value: 'true', type: 'BOOLEAN', description: 'Whether payment protection is active on the platform' },
    { key: 'calling_enabled', value: 'true', type: 'BOOLEAN', description: 'Whether virtual masked calling is enabled' },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, description: s.description },
      create: s,
    });
  }
  console.log('✅ Dynamic System Settings seeded');

  // 6. Test Development Users
  const passwordHash = await bcrypt.hash('VaziroPass2026!', 10);

  // Admin User
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@vaziro.in' },
    update: {},
    create: {
      email: 'admin@vaziro.in',
      phone: '+919876543210',
      phoneCountryCode: '+91',
      passwordHash,
      firstName: 'Vaziro',
      lastName: 'Administrator',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });
  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  if (adminRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: adminUser.id, roleId: adminRole.id } },
      update: {},
      create: { userId: adminUser.id, roleId: adminRole.id },
    });
  }

  // Customer User
  const customerUser = await prisma.user.upsert({
    where: { email: 'customer@vaziro.in' },
    update: {},
    create: {
      email: 'customer@vaziro.in',
      phone: '+919876500001',
      phoneCountryCode: '+91',
      passwordHash,
      firstName: 'Rahul',
      lastName: 'Sharma',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });
  const customerRole = await prisma.role.findUnique({ where: { name: 'CUSTOMER' } });
  if (customerRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: customerUser.id, roleId: customerRole.id } },
      update: {},
      create: { userId: customerUser.id, roleId: customerRole.id },
    });
    await prisma.customerProfile.upsert({
      where: { userId: customerUser.id },
      update: {},
      create: {
        userId: customerUser.id,
        trustScore: 98.5,
        jobsPostedCount: 3,
        jobsCompletedCount: 2,
      },
    });
  }

  // Professional User
  const proUser = await prisma.user.upsert({
    where: { email: 'pro@vaziro.in' },
    update: {},
    create: {
      email: 'pro@vaziro.in',
      phone: '+919876500002',
      phoneCountryCode: '+91',
      passwordHash,
      firstName: 'Priya',
      lastName: 'Nair',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
    },
  });
  const proRole = await prisma.role.findUnique({ where: { name: 'PROFESSIONAL' } });
  if (proRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: proUser.id, roleId: proRole.id } },
      update: {},
      create: { userId: proUser.id, roleId: proRole.id },
    });
    const proProfile = await prisma.professionalProfile.upsert({
      where: { userId: proUser.id },
      update: {},
      create: {
        userId: proUser.id,
        title: 'Senior Certified Physiotherapist & Rehabilitation Specialist',
        bio: 'BPT certified with 7+ years clinical experience in geriatric mobility, post-operative rehabilitation, and acute pain management across Bengaluru.',
        yearsOfExperience: 7,
        hourlyRate: 800.0,
        currency: 'INR',
        languages: 'English, Hindi, Kannada',
        rating: 4.95,
        reviewsCount: 34,
        completedJobsCount: 42,
        responseRatePercentage: 98.0,
        isVerified: true,
        isFeatured: true,
      },
    });

    // Verification
    await prisma.verification.upsert({
      where: { professionalProfileId: proProfile.id },
      update: {},
      create: {
        professionalProfileId: proProfile.id,
        status: 'VERIFIED',
        provider: 'DIGILOCKER',
        referenceId: 'DL-IN-2026-PHYSIO-84920',
        verifiedAt: new Date(),
      },
    });

    // Credit Wallet initialized with Growth Plan (55 Credits)
    const wallet = await prisma.creditWallet.upsert({
      where: { professionalProfileId: proProfile.id },
      update: { balance: 55 },
      create: {
        professionalProfileId: proProfile.id,
        balance: 55,
        lifetimePurchased: 55,
        lifetimeSpent: 0,
      },
    });

    await prisma.creditTransaction.create({
      data: {
        creditWalletId: wallet.id,
        amount: 55,
        transactionType: 'PLAN_CREDIT',
        balanceAfter: 55,
        notes: 'Initial Seed Growth Plan Allotment',
      },
    });
  }
  console.log('✅ Demo test users (Admin, Customer, Professional with 55 credits) seeded');

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

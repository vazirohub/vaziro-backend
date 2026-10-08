const https = require('https');

const API_BASE = 'https://api.vaziro.in/api/v1';

// Helper for HTTP requests
function apiRequest(method, endpoint, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + endpoint);
    const bodyStr = data ? JSON.stringify(data) : null;

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (bodyStr) {
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = https.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: rawData });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// 40 Comprehensive, Authentic Job Posts
const JOBS = [
  // 1. Elderly Caregiver (5 jobs)
  {
    catId: '2024b709-aafd-4260-a413-11947a598f26',
    subId: 'a1c981af-d977-466c-8547-fe2f2bfce881',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110070',
    title: 'Full-time Caregiver for Senior Mother in Vasant Kunj',
    description: 'Seeking an attentive and gentle female caregiver for my 78-year-old mother recovering from hip surgery. Assistance needed with mobility, sponge bath, medication reminders, and light walking support.',
    budgetType: 'FIXED',
    budgetMin: 18000,
    budgetMax: 18000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '2024b709-aafd-4260-a413-11947a598f26',
    subId: 'c8765b03-8bc2-4f76-926d-27b6a7c8f957',
    cityId: '0453b9b5-db67-493c-8aae-21eaf9f4c787', // Noida
    pincode: '201301',
    title: 'Dementia Patient Companion & Attendant in Sector 50, Noida',
    description: 'Require a trained caregiver with experience in managing mild Alzheimer\'s for my 82-year-old father. Patient needs patience, cognitive engagement, companionship, and daily routine supervision.',
    budgetType: 'RANGE',
    budgetMin: 20000,
    budgetMax: 24000,
    frequency: 'MONTHLY',
    timeline: 'WITHIN_WEEK',
  },
  {
    catId: '2024b709-aafd-4260-a413-11947a598f26',
    subId: '80b48fab-41d8-4c7a-b029-23b18b125c73',
    cityId: '95a27243-a6db-47d6-bcef-60e7ee5cbc2f', // Gurugram
    pincode: '122002',
    title: '12-Hour Day Attendant for Bedridden Father in DLF Phase 2, Gurugram',
    description: 'Need an experienced male attendant from 8 AM to 8 PM. Support needed with feeding, bed positioning, diaper changing, and vitals monitoring.',
    budgetType: 'FIXED',
    budgetMin: 16000,
    budgetMax: 16000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '2024b709-aafd-4260-a413-11947a598f26',
    subId: '4e7df212-79af-4b50-b0e4-897f9cdb56de',
    cityId: '419869db-1287-493b-9bc7-7ab69a6b7c66', // Ghaziabad
    pincode: '201014',
    title: 'Night Caregiver for Post-Discharge Senior Resident in Indirapuram',
    description: 'Looking for a reliable night attendant from 9 PM to 7 AM to support an elderly gentleman prone to disorientation during sleep hours. Must be awake and attentive.',
    budgetType: 'FIXED',
    budgetMin: 14000,
    budgetMax: 14000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '2024b709-aafd-4260-a413-11947a598f26',
    subId: '28313481-bc5c-46d8-a78e-ab71f2673d3d',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110085',
    title: 'Part-time Morning Mobility Attendant in Rohini Sector 9, Delhi',
    description: 'Need a caregiver for 4 hours each morning (8 AM - 12 PM) to help my grandfather with morning hygiene, park walking, and breakfast assistance.',
    budgetType: 'FIXED',
    budgetMin: 8500,
    budgetMax: 8500,
    frequency: 'MONTHLY',
    timeline: 'WITHIN_WEEK',
  },

  // 2. Fitness Trainer (5 jobs)
  {
    catId: '925fbd6e-2db3-4272-b627-4a9bddb4032e',
    subId: 'a1e14496-7482-4b9d-9008-a453823c1070',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110048',
    title: 'Personal Weight Loss Fitness Trainer at Home in Greater Kailash 1',
    description: 'Looking for a certified personal fitness trainer for 5 sessions/week at home. Goal is 10kg fat loss with functional training, kettlebells, and HIIT workouts. Evening slot 6:30 PM.',
    budgetType: 'RANGE',
    budgetMin: 12000,
    budgetMax: 15000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '925fbd6e-2db3-4272-b627-4a9bddb4032e',
    subId: '3508451c-9a38-4927-b8f2-a55aa8c850f9',
    cityId: '95a27243-a6db-47d6-bcef-60e7ee5cbc2f', // Gurugram
    pincode: '122002',
    title: 'Post-Pregnancy Core & Strength Fitness Coach in Golf Course Road',
    description: 'Looking for a female fitness coach specializing in postpartum recovery, diastasis recti safe core training, and overall endurance. Morning 10 AM sessions 3 days/week.',
    budgetType: 'FIXED',
    budgetMin: 14000,
    budgetMax: 14000,
    frequency: 'MONTHLY',
    timeline: 'FLEXIBLE',
  },
  {
    catId: '925fbd6e-2db3-4272-b627-4a9bddb4032e',
    subId: '75d46957-fb24-479c-ac52-b8f310dd862e',
    cityId: '0453b9b5-db67-493c-8aae-21eaf9f4c787', // Noida
    pincode: '201305',
    title: 'Senior Citizen Gentle Strength & Balance Trainer in Sector 137, Noida',
    description: 'Need a patient personal trainer for my 68-year-old father focusing on fall prevention, low-impact joint mobility, and resistance band strength.',
    budgetType: 'FIXED',
    budgetMin: 9000,
    budgetMax: 9000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '925fbd6e-2db3-4272-b627-4a9bddb4032e',
    subId: '315bb699-99b8-4060-a928-750bcc49b59f',
    cityId: '419869db-1287-493b-9bc7-7ab69a6b7c66', // Ghaziabad
    pincode: '201017',
    title: 'Bodybuilding & Calisthenics Home Coach in Raj Nagar Extension',
    description: 'Looking for an enthusiastic strength coach for home workouts with pull-up bar, dumbbells, and bodyweight progression. 4 days/week.',
    budgetType: 'RANGE',
    budgetMin: 10000,
    budgetMax: 12000,
    frequency: 'MONTHLY',
    timeline: 'WITHIN_WEEK',
  },
  {
    catId: '925fbd6e-2db3-4272-b627-4a9bddb4032e',
    subId: '1ebdf355-0365-452a-878e-f232f52b707d',
    cityId: 'c7578c55-b999-4554-8e3e-9ed23cffbf41', // Greater Noida
    pincode: '201310',
    title: 'High-Intensity Interval Training Coach for Couple in Chi 4, Greater Noida',
    description: 'Husband and wife looking for a home fitness coach for 1-hour sessions 4 days a week. Focus on cardiovascular health and strength conditioning.',
    budgetType: 'FIXED',
    budgetMin: 14000,
    budgetMax: 14000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },

  // 3. Home Cook / Chef (5 jobs)
  {
    catId: '727666b4-fa32-4293-8eca-94c46c411c54',
    subId: '3d3c777f-1840-43d5-b8ce-7c0c5cdc20bd',
    cityId: '0453b9b5-db67-493c-8aae-21eaf9f4c787', // Noida
    pincode: '201309',
    title: 'Pure Vegetarian Daily Home Cook for Family of 4 in Sector 62, Noida',
    description: 'Looking for a clean and hygienic cook for lunch and dinner preparation. Authentic North Indian home-style dishes (dal, subzi, rotis, rice). Non-smoker required.',
    budgetType: 'FIXED',
    budgetMin: 8500,
    budgetMax: 8500,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '727666b4-fa32-4293-8eca-94c46c411c54',
    subId: 'ae7a9316-f404-444b-8eb2-5608ec767777',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110075',
    title: 'Authentic South Indian Breakfast & Dinner Cook in Dwarka Sector 11',
    description: 'Need experienced cook well-versed in dosas, idli, sambar, rasam, and traditional Tamil/Kerala cuisine. Morning and evening visits.',
    budgetType: 'FIXED',
    budgetMin: 9000,
    budgetMax: 9000,
    frequency: 'MONTHLY',
    timeline: 'WITHIN_WEEK',
  },
  {
    catId: '727666b4-fa32-4293-8eca-94c46c411c54',
    subId: '3d3c777f-1840-43d5-b8ce-7c0c5cdc20bd',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110034',
    title: 'Strict Jain Food Cook (No Onion, No Garlic) in Pitampura, Delhi',
    description: 'Looking for a pure Jain cook who follows kitchen maryada and strict satvik cooking guidelines for lunch and dinner for 5 family members.',
    budgetType: 'RANGE',
    budgetMin: 10000,
    budgetMax: 12000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '727666b4-fa32-4293-8eca-94c46c411c54',
    subId: '3acb9322-3f24-4de4-9c79-ab5d8b350410',
    cityId: '95a27243-a6db-47d6-bcef-60e7ee5cbc2f', // Gurugram
    pincode: '122002',
    title: 'Diabetic & Heart-Healthy Low Oil Diet Cook in Cyber City, Gurugram',
    description: 'Need a health-conscious cook to prepare balanced low-glycemic meals, salads, boiled vegetables, and multigrain rotis for elderly parents with diabetes.',
    budgetType: 'FIXED',
    budgetMin: 12000,
    budgetMax: 12000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '727666b4-fa32-4293-8eca-94c46c411c54',
    subId: 'b74c08cb-8f55-4775-87e5-44bda55f885f',
    cityId: '0453b9b5-db67-493c-8aae-21eaf9f4c787', // Noida
    pincode: '201310',
    title: 'Weekend Party Chef for 12 Guests in Sector 150, Noida',
    description: 'Hosting a family get-together this Saturday. Need an experienced multi-cuisine chef for starters (tikkas, kebabs) and main course dinner.',
    budgetType: 'FIXED',
    budgetMin: 4500,
    budgetMax: 4500,
    frequency: 'ONE_TIME',
    timeline: 'WITHIN_WEEK',
  },

  // 4. Home Nurse (5 jobs)
  {
    catId: 'fdd69570-a17f-44c7-8a01-bed4791a41f9',
    subId: 'ad85cdd0-1280-47ca-a202-dd25a3ae97bc',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110017',
    title: 'Certified GNM Nurse for Post-Cardiac Surgery Care in Saket',
    description: 'Looking for a qualified female nurse for monitoring vitals, ECG follow-up, daily medication, and wound dressing after open-heart bypass surgery.',
    budgetType: 'RANGE',
    budgetMin: 24000,
    budgetMax: 28000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: 'fdd69570-a17f-44c7-8a01-bed4791a41f9',
    subId: '58766166-2c0d-4d45-9daf-e9304be874de',
    cityId: '95a27243-a6db-47d6-bcef-60e7ee5cbc2f', // Gurugram
    pincode: '122018',
    title: '12-Hour Day Clinical Nurse for Tracheostomy Care in Sector 48, Gurugram',
    description: 'Need an ICU-trained nurse skilled in tracheostomy suctioning, Ryles tube feeding, and oxygen therapy. 8 AM to 8 PM.',
    budgetType: 'FIXED',
    budgetMin: 28000,
    budgetMax: 28000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: 'fdd69570-a17f-44c7-8a01-bed4791a41f9',
    subId: '29833116-d95a-4740-8928-b18e13f47bff',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110009',
    title: 'Home Visit Nurse for Daily IV Antibiotic Infusion in Model Town',
    description: 'Need a licensed nurse for a 7-day course of IV antibiotic drip administration and IV cannula care once daily at 11 AM.',
    budgetType: 'FIXED',
    budgetMin: 6000,
    budgetMax: 6000,
    frequency: 'ONE_TIME',
    timeline: 'ASAP',
  },
  {
    catId: 'fdd69570-a17f-44c7-8a01-bed4791a41f9',
    subId: '29833116-d95a-4740-8928-b18e13f47bff',
    cityId: '419869db-1287-493b-9bc7-7ab69a6b7c66', // Ghaziabad
    pincode: '201012',
    title: 'Diabetic Foot Ulcer Wound Dressing Nurse in Vasundhara, Ghaziabad',
    description: 'Looking for an experienced nurse for sterile wound dressing and cleaning of diabetic foot ulcer alternate days for 2 weeks.',
    budgetType: 'FIXED',
    budgetMin: 7500,
    budgetMax: 7500,
    frequency: 'ONE_TIME',
    timeline: 'ASAP',
  },
  {
    catId: 'fdd69570-a17f-44c7-8a01-bed4791a41f9',
    subId: '1f0d5b3b-9c8f-4ba9-b2ae-430ee48316ea',
    cityId: 'c7578c55-b999-4554-8e3e-9ed23cffbf41', // Greater Noida
    pincode: '201308',
    title: 'Post-Cesarean Mother & Newborn Clinical Nurse in Alpha 1, Greater Noida',
    description: 'Need a compassionate staff nurse for post-op surgical incision care, newborn jaundice observation, and infant vitals check.',
    budgetType: 'RANGE',
    budgetMin: 18000,
    budgetMax: 20000,
    frequency: 'MONTHLY',
    timeline: 'WITHIN_WEEK',
  },

  // 5. Home Tutor (5 jobs)
  {
    catId: 'c5f6183e-fdda-49b2-b4e6-2a7142774f36',
    subId: 'bed8fae9-16b3-4816-abca-034d4951b768',
    cityId: '95a27243-a6db-47d6-bcef-60e7ee5cbc2f', // Gurugram
    pincode: '122009',
    title: 'CBSE Class 12 Physics & Chemistry Tutor in Sector 43, Gurugram',
    description: 'Looking for an experienced tutor for Class 12 board and JEE Mains prep. Focus on numerical problem solving and conceptual clarity. 4 days/week.',
    budgetType: 'FIXED',
    budgetMin: 12000,
    budgetMax: 12000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: 'c5f6183e-fdda-49b2-b4e6-2a7142774f36',
    subId: '9caeef3e-dc2a-402d-93df-652ca3059340',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110091',
    title: 'ICSE Class 9 Mathematics & Biology Home Tutor in Mayur Vihar Phase 1',
    description: 'Seeking an engaging tutor for Class 9 ICSE syllabus. 3 days a week, 1.5 hours per session. Prior ICSE teaching track record preferred.',
    budgetType: 'RANGE',
    budgetMin: 8000,
    budgetMax: 9500,
    frequency: 'MONTHLY',
    timeline: 'WITHIN_WEEK',
  },
  {
    catId: 'c5f6183e-fdda-49b2-b4e6-2a7142774f36',
    subId: '045dc1aa-4522-4896-ae91-3e496db3cea9',
    cityId: '0453b9b5-db67-493c-8aae-21eaf9f4c787', // Noida
    pincode: '201304',
    title: 'Primary School All Subjects Female Tutor (Class 4) in Sector 76, Noida',
    description: 'Looking for an affectionate female home tutor for daily homework, English reading, basic Hindi, and foundational maths for a 9-year-old child.',
    budgetType: 'FIXED',
    budgetMin: 6000,
    budgetMax: 6000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: 'c5f6183e-fdda-49b2-b4e6-2a7142774f36',
    subId: 'a20f4967-1bb2-47df-b2aa-95eb8d704e3c',
    cityId: '419869db-1287-493b-9bc7-7ab69a6b7c66', // Ghaziabad
    pincode: '201016',
    title: 'Spoken English & Corporate Communication Tutor in Crossing Republik',
    description: 'Need a fluent English trainer for college student to improve presentation skills, pronunciation, and corporate interview readiness.',
    budgetType: 'FIXED',
    budgetMin: 7000,
    budgetMax: 7000,
    frequency: 'MONTHLY',
    timeline: 'WITHIN_WEEK',
  },
  {
    catId: 'c5f6183e-fdda-49b2-b4e6-2a7142774f36',
    subId: '8199b83c-9b21-4952-9e6d-a24e8e9ae16c',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110049',
    title: 'French Language Tutor for Class 8 Student in South Extension',
    description: 'Looking for a certified French language teacher for CBSE school curriculum (DELF A1 level). Weekend classes preferred.',
    budgetType: 'FIXED',
    budgetMin: 7500,
    budgetMax: 7500,
    frequency: 'MONTHLY',
    timeline: 'FLEXIBLE',
  },

  // 6. Nanny & Baby Care (5 jobs)
  {
    catId: '9deea260-2bb3-41dc-885f-8328a2c9e6f4',
    subId: '01b77e2f-fee7-4e1f-8ccd-9c9231ea8c2e',
    cityId: '95a27243-a6db-47d6-bcef-60e7ee5cbc2f', // Gurugram
    pincode: '122003',
    title: 'Experienced Japa Maid for Newborn & Mother Care in Sector 57, Gurugram',
    description: 'Looking for a traditional Japa maid for 45 days. Must know baby massage, mother oil massage, baby bath, sterile bottle cleaning, and newborn sleep routine.',
    budgetType: 'RANGE',
    budgetMin: 28000,
    budgetMax: 32000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '9deea260-2bb3-41dc-885f-8328a2c9e6f4',
    subId: '66361dc8-5bfa-4d95-8dbe-2e8b2ed152e3',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110016',
    title: 'Daytime Babysitter for 1.5-Year-Old Toddler in Hauz Khas, Delhi',
    description: 'Working mother seeks caring babysitter from 9 AM to 5 PM Monday to Friday. Duties include sensory play, reading books, diaper changes, and feeding healthy snacks.',
    budgetType: 'FIXED',
    budgetMin: 14000,
    budgetMax: 14000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '9deea260-2bb3-41dc-885f-8328a2c9e6f4',
    subId: 'cc0d7e57-708c-45e6-8d32-93b2da5abe2d',
    cityId: '0453b9b5-db67-493c-8aae-21eaf9f4c787', // Noida
    pincode: '201304',
    title: 'Full-Time Live-in Nanny for Working Parents in Sector 128, Noida',
    description: 'Looking for an educated, police-verified live-in nanny for a 3-year-old child. Accommodation and meals provided. Focus on child safety and early learning.',
    budgetType: 'RANGE',
    budgetMin: 20000,
    budgetMax: 22000,
    frequency: 'MONTHLY',
    timeline: 'WITHIN_WEEK',
  },
  {
    catId: '9deea260-2bb3-41dc-885f-8328a2c9e6f4',
    subId: '3bb30a45-e663-4269-9463-9364948551fa',
    cityId: '95a27243-a6db-47d6-bcef-60e7ee5cbc2f', // Gurugram
    pincode: '122001',
    title: 'Evening Babysitter for Twin Toddlers in Sector 14, Gurugram',
    description: 'Need assistance for 4 hours every evening (4 PM to 8 PM) to help manage 2-year-old active twins during playtime and dinner.',
    budgetType: 'FIXED',
    budgetMin: 11000,
    budgetMax: 11000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '9deea260-2bb3-41dc-885f-8328a2c9e6f4',
    subId: 'a4ced0c8-4176-4615-b6f4-cebd7b401bd3',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110027',
    title: 'Night Care Nanny for 4-Month-Old Infant in Rajouri Garden',
    description: 'Seeking an experienced night nanny from 10 PM to 6 AM to assist with night feeds, burping, and soothing baby to sleep so parents can rest.',
    budgetType: 'FIXED',
    budgetMin: 16000,
    budgetMax: 16000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },

  // 7. Physiotherapist (5 jobs)
  {
    catId: '128e6304-f964-4c38-9916-4a5519ef39b3',
    subId: '505e390f-cdea-47eb-92d4-894a3ca86e95',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110026',
    title: 'Home Physiotherapy for Knee Replacement (TKR) in Punjabi Bagh',
    description: 'Looking for a BPT/MPT physiotherapist for 15 post-operative knee replacement sessions. Focus on quadriceps strengthening, knee flexion, and gait training.',
    budgetType: 'FIXED',
    budgetMin: 15000,
    budgetMax: 15000,
    frequency: 'ONE_TIME',
    timeline: 'ASAP',
  },
  {
    catId: '128e6304-f964-4c38-9916-4a5519ef39b3',
    subId: '8a448367-77d1-4f08-b59c-15628ed78be2',
    cityId: '0453b9b5-db67-493c-8aae-21eaf9f4c787', // Noida
    pincode: '201304',
    title: 'Neuro-Physiotherapist for Paralytic Stroke Recovery in Sector 93, Noida',
    description: 'Need dedicated neuro-physio for 72-year-old patient with right hemiplegia. Daily 45-minute sessions for upper and lower limb motor recovery.',
    budgetType: 'RANGE',
    budgetMin: 18000,
    budgetMax: 22000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '128e6304-f964-4c38-9916-4a5519ef39b3',
    subId: 'd58c5c79-989f-48ab-ac9d-b79cbf1f0a54',
    cityId: '95a27243-a6db-47d6-bcef-60e7ee5cbc2f', // Gurugram
    pincode: '122009',
    title: 'Back & Sciatic Nerve Pain Relief Therapy in Sushant Lok 1',
    description: 'Software engineer suffering from acute L4-L5 disc herniation and sciatica. Need 10 sessions with IFT/TENS, spinal traction, and core stabilization.',
    budgetType: 'FIXED',
    budgetMin: 8000,
    budgetMax: 8000,
    frequency: 'ONE_TIME',
    timeline: 'ASAP',
  },
  {
    catId: '128e6304-f964-4c38-9916-4a5519ef39b3',
    subId: '6da1bb8e-8ea4-45c7-adb6-ff830df2a7b9',
    cityId: '419869db-1287-493b-9bc7-7ab69a6b7c66', // Ghaziabad
    pincode: '201010',
    title: 'Elderly Mobility & Balance Physiotherapist in Vaishali, Ghaziabad',
    description: 'Looking for home physiotherapist for grandmother with severe osteo-arthritis to restore unassisted walking and reduce stiffness. 3 days/week.',
    budgetType: 'FIXED',
    budgetMin: 10000,
    budgetMax: 10000,
    frequency: 'MONTHLY',
    timeline: 'WITHIN_WEEK',
  },
  {
    catId: '128e6304-f964-4c38-9916-4a5519ef39b3',
    subId: '6fc50792-88e0-4e0f-bb89-d3e21b1bc58a',
    cityId: 'c7578c55-b999-4554-8e3e-9ed23cffbf41', // Greater Noida
    pincode: '201306',
    title: 'Sports Injury Shoulder Rotator Cuff Rehab in Greater Noida West',
    description: 'Need physiotherapist for badminton player with grade 2 supraspinatus tear. Manual therapy, theraband strengthening, and range-of-motion restoration.',
    budgetType: 'FIXED',
    budgetMin: 9000,
    budgetMax: 9000,
    frequency: 'ONE_TIME',
    timeline: 'ASAP',
  },

  // 8. Yoga Instructor (5 jobs)
  {
    catId: '46cfe91d-5d96-4a65-87ba-19d5930a7ee5',
    subId: '7b8fd8c2-f366-413a-bcfe-61edba114a30',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110057',
    title: 'Private Morning Hatha Yoga Teacher in Vasant Vihar, Delhi',
    description: 'Looking for a certified yoga guru for 1-hour sessions 3 mornings a week at 6:30 AM. Focus on alignment, surya namaskars, and pranayama.',
    budgetType: 'FIXED',
    budgetMin: 10000,
    budgetMax: 10000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '46cfe91d-5d96-4a65-87ba-19d5930a7ee5',
    subId: 'ab67d3dd-7421-4304-a067-e7478a69aa64',
    cityId: '95a27243-a6db-47d6-bcef-60e7ee5cbc2f', // Gurugram
    pincode: '122011',
    title: 'Weight Loss & Power Yoga Instructor in Sector 54, Gurugram',
    description: 'Seeking dynamic yoga instructor for intense calorie-burning vinyasa flow and core toning. 4 days a week for two sisters at home.',
    budgetType: 'RANGE',
    budgetMin: 12000,
    budgetMax: 15000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '46cfe91d-5d96-4a65-87ba-19d5930a7ee5',
    subId: '3ad90184-35ff-45b7-a109-24ab852bf98c',
    cityId: '0453b9b5-db67-493c-8aae-21eaf9f4c787', // Noida
    pincode: '201301',
    title: 'Gentle Chair Yoga & Pranayama for Senior Couple in Sector 15, Noida',
    description: 'Looking for a calm and gentle teacher for parents aged 74 and 70. Breathing exercises, gentle joint loosening, and meditation for stress relief.',
    budgetType: 'FIXED',
    budgetMin: 8000,
    budgetMax: 8000,
    frequency: 'MONTHLY',
    timeline: 'WITHIN_WEEK',
  },
  {
    catId: '46cfe91d-5d96-4a65-87ba-19d5930a7ee5',
    subId: 'f7ca02eb-370e-4570-9f79-7de6d9567ea4',
    cityId: 'ce9d2ca4-1e47-473b-bab1-6d97c53bc61b', // Delhi
    pincode: '110024',
    title: 'Certified Prenatal Yoga Instructor in Defence Colony, Delhi',
    description: 'Expecting mother in 2nd trimester seeks experienced certified prenatal yoga instructor. Focus on pelvic floor strength, breathing, and safe stretching.',
    budgetType: 'FIXED',
    budgetMin: 14000,
    budgetMax: 14000,
    frequency: 'MONTHLY',
    timeline: 'ASAP',
  },
  {
    catId: '46cfe91d-5d96-4a65-87ba-19d5930a7ee5',
    subId: '1a48d12b-b6bb-4b80-9227-d7881efff1eb',
    cityId: '419869db-1287-493b-9bc7-7ab69a6b7c66', // Ghaziabad
    pincode: '201011',
    title: 'Therapeutic Yoga for Thyroid & PCOS Management in Surya Nagar',
    description: 'Looking for knowledgeable yoga instructor specializing in hormonal balance, sarvangasana, ujjayi breathing, and lifestyle guidance. 3 sessions/week.',
    budgetType: 'FIXED',
    budgetMin: 9000,
    budgetMax: 9000,
    frequency: 'MONTHLY',
    timeline: 'WITHIN_WEEK',
  },
];

async function main() {
  console.log(`Starting generation of 40 authentic job posts across Delhi NCR...`);

  // Step 1: Create or fetch client accounts on production
  const clients = [
    { name: 'Pooja Singhania', email: 'pooja.singhania.client@gmail.com', phone: '+919811223344' },
    { name: 'Vikram Malhotra', email: 'vikram.malhotra.client@gmail.com', phone: '+919822334455' },
    { name: 'Meera Iyer', email: 'meera.iyer.client@gmail.com', phone: '+919833445566' },
    { name: 'Rohit Verma', email: 'rohit.verma.client@gmail.com', phone: '+919844556677' },
    { name: 'Neha Chawla', email: 'neha.chawla.client@gmail.com', phone: '+919855667788' },
  ];

  const clientTokens = [];

  for (const c of clients) {
    try {
      const regRes = await apiRequest('POST', '/auth/register', {
        name: c.name,
        email: c.email,
        phone: c.phone,
        password: 'VaziroClientPass@2026',
        role: 'CUSTOMER',
      });

      if (regRes.data?.data?.accessToken) {
        clientTokens.push(regRes.data.data.accessToken);
        console.log(`Registered client: ${c.name}`);
      } else {
        // Try login
        const loginRes = await apiRequest('POST', '/auth/login', {
          identifier: c.email,
          password: 'VaziroClientPass@2026',
        });
        if (loginRes.data?.data?.accessToken) {
          clientTokens.push(loginRes.data.data.accessToken);
          console.log(`Logged in client: ${c.name}`);
        }
      }
    } catch (err) {
      console.warn(`Could not register/login ${c.name}:`, err.message);
    }
  }

  // Fallback to our existing Aarav Sharma token if needed
  if (clientTokens.length === 0) {
    clientTokens.push('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMDYyZmFkNi05ZDEwLTQ5NzEtOWMyMy05NzAwYzljMTQ1ZDgiLCJpYXQiOjE3OTE0NzQ0ODQsImV4cCI6MTc5NDA2NjQ4NH0.rcfLmsI3McI9mRM6s5G4X6Xm01ielcFoLpm7m1P8XnQ');
  }

  console.log(`Active client tokens for publishing: ${clientTokens.length}`);

  let successCount = 0;

  for (let i = 0; i < JOBS.length; i++) {
    const job = JOBS[i];
    const token = clientTokens[i % clientTokens.length];

    const payload = {
      categoryId: job.catId,
      subcategoryId: job.subId,
      title: job.title,
      description: job.description,
      budgetType: job.budgetType,
      budgetMin: job.budgetMin,
      budgetMax: job.budgetMax,
      cityId: job.cityId,
      pincode: job.pincode,
      frequency: job.frequency,
      timeline: job.timeline,
      currency: 'INR',
    };

    try {
      const res = await apiRequest('POST', '/requirements', payload, token);
      if (res.status === 201 && res.data?.data?.id) {
        successCount++;
        console.log(`[${successCount}/40] Published: "${job.title}" (ID: ${res.data.data.id})`);
      } else {
        console.warn(`[Failed ${i + 1}] "${job.title}":`, res.data?.error?.message || res.status);
      }
    } catch (err) {
      console.error(`[Error ${i + 1}] "${job.title}":`, err.message);
    }

    // Gentle delay between API dispatches
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log(`\nSuccessfully created ${successCount} of 40 jobs on production API!`);
}

main().catch(console.error);

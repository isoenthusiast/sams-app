# SAMS App — Data Model Documentation

**Source:** `seam-assurance-app/prisma/schema.prisma` (45 models, 10 enums)  
**Database:** PostgreSQL 16 (local) / 18 (Railway)  
**ORM:** Prisma 7.8.0 + @prisma/adapter-pg  
**Status:** No changes — sams-app uses identical schema

---

## 1. Entity Relationship Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MULTI-COMPANY CORE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Company ──< UserCompany >── User (access control)                     │
│      │                                                                  │
│      ├──< Control, ProcessArea, SubProcess, Requirement (companyId)     │
│      ├──< Assessment, AssessmentTemplate, Attachment (companyId)        │
│      └──< UserRole (companyId)                                          │
│                                                                         │
│   Standard ──< ProcessArea (standardId)                                 │
│   ProcessArea ──< SubProcess                                            │
│   ProcessArea ──< Control                                               │
│   ProcessArea ──< Requirement                                           │
│   Requirement ──< MapControl2Requirement >── Control                    │
│   Control ──< ControlSubProcess >── SubProcess                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         ASSESSMENT WORKFLOW                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Assessment ──< ControlAssignment >── Control                          │
│        │                                                                │
│        ├──< Sample (evidence)                                           │
│        ├──< Finding ──< Action (remediation)                            │
│        └──< Aact (activities)                                           │
│              ├──< AActControls >── Control                              │
│              ├──< AActUsers >── User                                    │
│              └──< AActDetails                                           │
│                                                                         │
│   AssessmentTemplate ──< AssessmentTemplateControlLinkage >── Control   │
│   AssessmentTemplate ──< AssessmentTemplateActivityType                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      SUPPORTING SYSTEMS                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   User ──< UserRoleMapping >── UserRole                                 │
│   User ──< UserFavorite (entityType + entityId)                         │
│   User ──< PointTransaction (gamification)                              │
│   User ──< EmotionalDriveMetric (weekly rollup)                         │
│   User ──< Milestone                                                    │
│   User ──< UserAchievement >── AchievementBadge                         │
│   User ──< AActUsers >── Aact                                           │
│                                                                         │
│   Attachment ──< AttachmentMapping >── (Action | Finding | Sample)      │
│   Knowledgebase ──< MapArt2Know (artifact mapping)                      │
│   DocumentExtract ──< ControlFromDocument ──< ControlFDSubProcess       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Enums (10 total)

| Enum | Values | Used In |
|------|--------|---------|
| `Role` | Admin, Assessor | User.role |
| `LOA` | FirstLine, SecondLine, ThirdLine | AssuranceActivityType.defaultLOA, Assessment.loa |
| `ControlType` | Procedural, Technical, Analytical, Administrative, Physical, Other | Control.controlType |
| `AssessmentStatus` | Planned, InProgress, Completed, Cancelled | Assessment.status |
| `SampleStatus` | NotTested, Tested, InProgress | Sample.status |
| `SampleConclusion` | Effective, NotEffective, NotApplicable | Sample.conclusion |
| `Effectiveness` | Effective, NotEffective | ControlAssignment.effective |
| `FindingSeverity` | Low, Medium, High, Serious | Finding.severity |
| `EmotionalDrive` | Diversity, Belonging, Recognition, Achievement, Excellence, Growth, Contribution, Security | PointTransaction.drive, AchievementBadge.drive |
| `BadgeRarity` | Common, Uncommon, Rare, Epic, Legendary | AchievementBadge.rarity |

---

## 3. Core Models (by Domain)

### 3.1 Multi-Company Architecture

#### Company
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| companyID | String @unique | Business key (SAMS001, SMDS, OGP) |
| companyName | String | Full name |
| referenceID | String? | External reference |
| shortName | String? | Display abbreviation |
| createdAt | DateTime @default(now()) | |

**Relations:** userCompanies → UserCompany[]

#### UserCompany (M2M Junction)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| userId | String | FK → User |
| companyId | String | FK → Company.id |
| createdAt | DateTime @default(now()) | |

**Unique:** @@unique([userId, companyId])  
**Indexes:** @@index([userId]), @@index([companyId])

**Purpose:** Controls which companies appear in the header selector for each user.

---

### 3.2 User Management

#### User
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| name | String | Display name |
| username | String @unique | Login ID |
| passwordHash | String | BCrypt hash |
| role | Role @default(Assessor) | Admin or Assessor |
| position | String? | Job title |
| companyId | String? | Primary company (legacy, use UserCompany) |
| totalPoints | Int @default(0) | Gamification points |
| dailyPointStreak | Int @default(0) | Consecutive days active |
| lastActivityDate | DateTime? | Last login/activity |
| confidenceInfluencer | Boolean @default(false) | Special flag |
| createdAt | DateTime @default(now()) | |

**Relations:** assessments, emotionalDrives, milestones, points, achievements, roleMappings, userCompanies

#### UserRole
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| uRoleName | String | Role name |
| uRoleDescription | String? | Description |
| uRolePositions | String? | Applicable positions |
| uRoleReportingLine | String? | Reporting structure |
| companyId | String? | Company-scoped roles |
| createdAt | DateTime @default(now()) | |

**Unique:** @@unique([uRoleName, companyId])  
**Note:** Currently 0 rows in production — roles are defined by User.role enum, not this table.

#### UserRoleMapping (M2M Junction)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| userId | String | FK → User |
| userRoleId | String | FK → UserRole |
| remarks | String? | Assignment notes |
| createdDate | DateTime @default(now()) | |

**Unique:** @@unique([userId, userRoleId])  
**Note:** Currently 0 rows in production.

#### UserFavorite
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| userId | String | FK → User |
| entityType | String | "ProcessArea" | "SubProcess" | "Control" |
| entityId | String | ID of the favorited entity |
| createdAt | DateTime @default(now()) | |

**Unique:** @@unique([userId, entityType, entityId])  
**Purpose:** Personalized views — "Show only my favorite processes/controls"

---

### 3.3 Standards & Hierarchy

#### Standard
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| standard | String | Name (e.g., "Carbon, Environment, Social Performance") |
| standardDescription | String? | Description |
| sequenceNo | Int @default(0) | Display order |
| companyId | String? | Company-scoped (currently all SAMS001) |
| createdAt | DateTime @default(now()) | |

**Unique:** @@unique([standard, companyId])  
**Relations:** processAreas → ProcessArea[]

**6 Standards in production:**
1. Carbon, Environment, Social Performance, Product Stewardship & Quality
2. HSSE & SP Foundations
3. Process Safety & Asset Management
4. Transport Safety
5. Workplace Health, Safety & Security
6. International Standards (ISO)

#### ProcessArea
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| name | String | Display name |
| description | String? | Description |
| pId | String? | Legacy process ID |
| standard | String? | Legacy free-text standard |
| standardId | String? @map("StandardID") | FK → Standard.id |
| companyId | String? | Company scope |
| createdAt | DateTime @default(now()) | |

**Unique:** @@unique([name, companyId])  
**Indexes:** @@index([standardId])  
**Relations:** controls, subProcesses, badges, requirements

#### SubProcess
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| name | String | Display name |
| description | String? | Description |
| processAreaId | String | FK → ProcessArea |
| companyId | String? | Company scope |
| createdAt | DateTime @default(now()) | |

**Relations:** processArea, controlSubProcesses, controlFDSubProcesses

---

### 3.4 Controls

#### Control
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| name | String | Display name |
| statement | String | Full control statement |
| controlType | ControlType | 6 types |
| processAreaId | String | FK → ProcessArea |
| isHsseCritical | Boolean @default(false) | HSSE flag |
| ramRating | String? | RAM rating |
| riskWeight | Int @default(1) | Risk weighting |
| rawHealthScore | Int @default(80) | Auto-calculated (Effective/Total × 100) |
| lastTestedDate | DateTime? | Last assessment date |
| lastTestResult | String? | Pass/Fail |
| controlRef | String? | External reference |
| sourceFile | String? | Source document |
| practiceDocument | String? | Practice document |
| controlTypeDetail | String? | Detailed type |
| csfWho | String? | CSF: Who |
| csfWhat | String? | CSF: What |
| csfWhen | String? | CSF: When |
| csfWhere | String? | CSF: Where |
| csfWhy | String? | CSF: Why |
| csfHow | String? | CSF: How |
| csfEvidence | String? | CSF: Evidence |
| keyActivities | String? | Key activities |
| riskAddressed | String? | Risk description |
| testingApproach | String? | How to test |
| uncertainFlags | String? | Uncertainty flags |
| standard | String? | Legacy standard |
| pId | String? | Legacy process ID |
| Requirements | String? | Legacy requirements |
| companyId | String? | Company scope |
| createdAt | DateTime @default(now()) | |

**Unique:** @@unique([name, companyId])  
**Indexes:** @@index([controlRef])  
**Relations:** controlAssignments, controlSubProcesses, templateLinkages, requirementMappings, processArea

#### ControlSubProcess (M2M Junction)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| controlId | String | FK → Control |
| subProcessId | String | FK → SubProcess |
| isPrimary | Boolean @default(false) | Primary sub-process flag |
| createdAt | DateTime @default(now()) | |

**Unique:** @@unique([controlId, subProcessId])  
**Cascade:** onDelete: Cascade (both sides)

---

### 3.5 Requirements & Mapping

#### Requirement
| Field | Type | Notes |
|-------|------|-------|
| rId | Int @id | PK (rID in DB) |
| requirementId | String | Business key (e.g., "Air Quality - 1") |
| clauseContent | String | Full requirement text |
| intentOutcome | String? | Intended outcome |
| clauseApplicability | String? | Applicability notes |
| references | String? | External references |
| applicable | Boolean @default(true) | Active flag |
| standard | String? | Legacy standard |
| pId | String? | Legacy process ID |
| processAreaId | String? | FK → ProcessArea |
| companyId | String? | Company scope |
| createdAt | DateTime @default(now()) | |

**Unique:** @@unique([requirementId, processAreaId, companyId])  
**Relations:** controlMappings → MapControl2Requirement[], processArea

**Special:** Each ProcessArea has one "Unmapped Controls" requirement as a catch-all bucket.

#### MapControl2Requirement (M2M Junction)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| controlId | String | FK → Control |
| requirementRId | Int | FK → Requirement.rId |
| processAreaId | String? | Denormalized for filtering |
| createdAt | DateTime @default(now()) | |

**Unique:** @@unique([controlId, requirementRId])  
**Purpose:** Links controls to their governing requirements. Controls start in "Unmapped Controls" and are mapped to specific requirements.

---

### 3.6 Assessment Workflow

#### AssuranceActivityType
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| name | String @unique | Activity name |
| description | String? | Description |
| defaultLOA | LOA | Default level of assurance |
| createdAt | DateTime @default(now()) | |

**Relations:** assessments, templateLinkages

#### Assessment
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| name | String | Assessment name |
| activityTypeId | String | FK → AssuranceActivityType |
| assessorId | String | FK → User |
| startDate | DateTime | Start date |
| endDate | DateTime? | End date |
| status | AssessmentStatus | Planned/InProgress/Completed/Cancelled |
| loa | LOA | Level of assurance |
| companyId | String? | Company scope |
| createdAt | DateTime @default(now()) | |

**Relations:** activityType, assessor, controlAssignments, samples, findings, aacts

**Cascade Delete Chain:**
```
Assessment ──(Cascade)──▶ ControlAssignment
           ──(Cascade)──▶ Sample
           ──(Cascade)──▶ Finding ──(Cascade)──▶ Action
           ──(Cascade)──▶ Aact ──(Cascade)──▶ AActControls
                               ──(Cascade)──▶ AActUsers
                               ──(Cascade)──▶ AActDetails
```

#### ControlAssignment (M2M + Effectiveness)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| assessmentId | String | FK → Assessment |
| controlId | String | FK → Control |
| effective | Effectiveness? | Effective/NotEffective |
| createdAt | DateTime @default(now()) | |

**Unique:** @@unique([assessmentId, controlId])  
**Trigger:** Effectiveness changes auto-recalculate Control.rawHealthScore

#### Sample
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| assessmentId | String | FK → Assessment |
| sampleTypeId | String? | FK → SampleType |
| recordSourceId | String? | FK → RecordSourceType |
| status | SampleStatus | NotTested/Tested/InProgress |
| conclusion | SampleConclusion? | Effective/NotEffective/NotApplicable |
| controlEffective | Boolean? | Control effective flag |
| notes | String? | Testing notes |
| createdAt | DateTime @default(now()) | |

#### SampleType
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| name | String @unique | Type name |
| description | String? | Description |

#### RecordSourceType
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| name | String @unique | Source type name |
| description | String? | Description |

#### Finding
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| assessmentId | String | FK → Assessment |
| findingId | String? | Business key (FID-XXXXXX) |
| description | String | Finding description |
| severity | FindingSeverity | Low/Medium/High/Serious |
| risks | String? | Risk description |
| controlIds | String? | Comma-separated control IDs |
| createdAt | DateTime @default(now()) | |

**Relations:** actions → Action[]

#### Action
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| findingId | String | FK → Finding |
| actionId | String? | Business key (ACTID-XXXXXX) |
| actionDescription | String | What to do |
| actionParty | String? | Responsible party |
| targetDate | DateTime? | Due date |
| actionTaken | String? | What was done |
| actionClosureEffective | Boolean @default(false) | Closed flag |
| extensionDate | DateTime? | Extended due date |
| extensionReason | String? | Extension justification |
| createdDate | DateTime @default(now()) | |
| createdAt | DateTime @default(now()) | |

---

### 3.7 Assessment Activities

#### AssessmentActType
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| assacttypeid | String @unique | Business key (ACT-001) |
| assacttypeName | String @unique | Display name |
| description | String? | Description |
| createddate | DateTime @default(now()) | |

**Seeded:** Interview (ACT-001), DocumentReview (ACT-002), Site Visit (ACT-003)

#### Aact
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| aaID | String @unique | Business key |
| assuranceID | String | FK → Assessment.id (ON DELETE CASCADE) |
| assacttypeid | String | FK → AssessmentActType.assacttypeid |
| activityName | String | Activity name |
| activityDate | DateTime | Date |
| activityStartTime | String | Start time |
| activityEndTime | String | End time |
| activityDuration | String? | Duration |
| activityDescription | String? | Description |
| createdAt | DateTime @default(now()) | |

**Relations:** assessment, controls, users, details

#### AActControls (M2M)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| aaId | String | FK → Aact.aaID (ON DELETE CASCADE) |
| controlId | String | FK → Control |
| createdAt | DateTime @default(now()) | |

#### AActUsers (M2M)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| aaId | String | FK → Aact.aaID (ON DELETE CASCADE) |
| userId | String | FK → User |
| userRoles | String? | Role in activity |
| assignmentRemarks | String? | Notes |
| createdAt | DateTime @default(now()) | |

#### AActDetails
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| aactDetID | String? | Business key |
| aaId | String | FK → Aact.aaID (ON DELETE CASCADE) |
| detail | String? | Detail text |
| summaryAgainstControls | String? | Summary |
| checklists | String? | Checklist items |
| activityNotes | String? | Notes |
| createdAt | DateTime @default(now()) | |

---

### 3.8 Templates

#### AssessmentTemplate
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| name | String | Template name |
| description | String? | Description |
| companyId | String? | Company scope |
| createdAt | DateTime @default(now()) | |
| updatedAt | DateTime @updatedAt | |

**Unique:** @@unique([name, companyId])  
**Relations:** activityTypes, controlLinkages

#### AssessmentTemplateControlLinkage (M2M)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| templateId | String | FK → AssessmentTemplate |
| controlId | String | FK → Control |
| createdAt | DateTime @default(now()) | |

#### AssessmentTemplateActivityType (M2M)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| templateId | String | FK → AssessmentTemplate |
| activityTypeId | String | FK → AssuranceActivityType |
| createdAt | DateTime @default(now()) | |

---

### 3.9 Attachments

#### Attachment
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| fileName | String | Original filename |
| filePath | String | Storage path |
| fileSize | Int? | Bytes |
| description | String? | Description |
| uploadedBy | String? | User who uploaded |
| uploadDate | DateTime @default(now()) | |
| companyId | String? | Company scope |

#### AttachmentMapping (Polymorphic M2M)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| attachmentId | String | FK → Attachment |
| destTable | String | Target table name |
| recId | String | Target record ID |
| createdAt | DateTime @default(now()) | |

**Note:** Polymorphic — no FK constraint possible on (destTable, recId). Manual cleanup required on entity deletion.

---

### 3.10 Knowledge Management

#### Knowledgebase
| Field | Type | Notes |
|-------|------|-------|
| kID | String @id | PK |
| knowledgeName | String | Document name |
| knowledgeContent | String | Markdown content |
| remarks | String? | Notes |
| createdDate | DateTime @default(now()) | |
| addedBy | String? | Uploader |
| companyId | String? | Company scope |
| processAreaId | String? | Optional PA link |

**Unique:** @@unique([knowledgeName, companyId])

#### MapArt2Know (Artifact-to-Knowledge)
| Field | Type | Notes |
|-------|------|-------|
| mapA2KID | String @id | PK |
| artName | String | Artifact type |
| artID | String | Artifact ID |
| kID | String | FK → Knowledgebase |
| whyToMap | String? | Reason |

**Note:** Polymorphic — artID can reference any entity. Manual cleanup required.

---

### 3.11 Document Ingestion

#### DocumentExtract
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| docNo | String? | Document number |
| documentType | String? | Type |
| custodian | String? | Custodian |
| authorizer | String? | Authorizer |
| Status | String? | Workflow status |
| extractedText | String? | Full extracted text |
| createdAt | DateTime @default(now()) | |

#### ControlFromDocument
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| name | String | Control name |
| statement | String | Control statement |
| controlType | String | Type (not enum — legacy) |
| processAreaId | String? | FK → ProcessArea |
| isHsseCritical | Boolean @default(false) | HSSE flag |
| ramRating | String? | RAM rating |
| riskWeight | Int @default(1) | Risk weight |
| controlRef | String? | Reference |
| sourceFile | String? | Source document |
| controlTypeDetail | String? | Detailed type |
| csfWho/What/When/Where/Why/How/Evidence | String? | CSF fields |
| keyActivities | String? | Activities |
| riskAddressed | String? | Risk |
| testingApproach | String? | Testing approach |
| keyRiskIndicator | String? | KRI |
| uncertainFlags | String? | Flags |
| standard | String? | Standard |
| pId | String? | Process ID |
| companyId | String? | Company scope |
| createdAt | DateTime @default(now()) | |

#### ControlFDSubProcess (M2M)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| controlFromDocumentId | String | FK → ControlFromDocument |
| subProcessId | String | FK → SubProcess |
| isPrimary | Boolean @default(false) | Primary flag |
| createdAt | DateTime @default(now()) | |

**Unique:** @@unique([controlFromDocumentId, subProcessId])  
**Cascade:** onDelete: Cascade (both sides)

---

### 3.12 Gamification

#### PointTransaction
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| userId | String | FK → User |
| points | Int | Points awarded |
| drive | EmotionalDrive | Which drive |
| multiplier | Float @default(1.0) | Multiplier |
| activityType | String? | Activity type |
| description | String? | Description |
| activityLogId | String? | FK → ActivityLog |
| createdAt | DateTime @default(now()) | |

#### EmotionalDriveMetric
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| userId | String | FK → User |
| weekStart | DateTime | Week start date |
| diversity | Int @default(0) | Drive score |
| belonging | Int @default(0) | Drive score |
| recognition | Int @default(0) | Drive score |
| achievement | Int @default(0) | Drive score |
| excellence | Int @default(0) | Drive score |
| growth | Int @default(0) | Drive score |
| contribution | Int @default(0) | Drive score |
| security | Int @default(0) | Drive score |
| overallEngagement | Int @default(0) | Overall score |
| createdAt | DateTime @default(now()) | |

#### Milestone
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| userId | String | FK → User |
| title | String | Milestone title |
| targetValue | Int | Target |
| currentValue | Int @default(0) | Current |
| type | String? | Milestone type |
| completedAt | DateTime? | Completion date |
| createdAt | DateTime @default(now()) | |

#### AchievementBadge
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| name | String | Badge name |
| description | String? | Description |
| drive | EmotionalDrive | Associated drive |
| rarity | BadgeRarity | Common through Legendary |
| processAreaId | String? | Optional PA link |
| companyId | String? | Company scope |
| createdAt | DateTime @default(now()) | |

#### UserAchievement (M2M)
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| userId | String | FK → User |
| badgeId | String | FK → AchievementBadge |
| earnedAt | DateTime @default(now()) | |
| progress | Int @default(100) | Progress % |

#### GameAttribute
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| attributeName | String | Attribute name |
| status | String? | Status |
| createdAt | DateTime @default(now()) | |

#### GameAttributeRule
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| attributeId | String | FK → GameAttribute |
| activityTypeId | String? | FK → AssuranceActivityType |
| basePoints | Int @default(0) | Base points |
| perControlPoints | Int @default(0) | Points per control |
| hsseBonus | Int @default(0) | HSSE bonus |
| qualityBonus | Int @default(0) | Quality bonus |
| multiplier | Float @default(1.0) | Multiplier |
| createdAt | DateTime @default(now()) | |

---

### 3.13 Activity Logging

#### ActivityLog
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| timestamp | DateTime @default(now()) | Event time |
| description | String | What happened |
| activityType | String | Event type (31 valid types) |
| username | String | Who did it |
| refTable | String? | Related table |
| refRecord | String? | Related record ID |
| beforeData | Json? | Before state |
| afterData | Json? | After state |
| createdAt | DateTime @default(now()) | |

**Indexes:** @@index([timestamp]), @@index([username]), @@index([activityType]), @@index([refTable])  
**Relations:** pointTransactions → PointTransaction[]

#### ActivityLogType
| Field | Type | Notes |
|-------|------|-------|
| id | String @id @default(cuid()) | PK |
| activityType | String @unique | Type name |
| refTable | String? | Related table |
| description | String? | Description |
| createdAt | DateTime @default(now()) | |

**31 Activity Types:**
- Template CRUD: TemplateCreated, TemplateUpdated, TemplateDeleted, TemplateAdopted
- Assessment CRUD: AssessmentCreated, AssessmentUpdated, AssessmentDeleted, AssessmentStarted, AssessmentCompleted
- Control Testing: ControlTested, ControlEffective, ControlNotEffective
- Sample CRUD: SampleCreated, SampleUpdated, SampleDeleted
- Finding CRUD: FindingCreated, FindingUpdated, FindingDeleted
- Action CRUD: ActionCreated, ActionUpdated, ActionDeleted, ActionClosed
- User Management: UserCreated, UserUpdated, UserDeleted, UserRoleAssigned, UserCompanyAssigned
- Process/Control: ProcessAreaCreated, SubProcessCreated, ControlCreated
- System: CSVImport, SQLExecuted, AuthLogin, AuthLogout, MappingChanged

---

## 4. Key Relationships Summary

```
Company ──< UserCompany >── User (access control)
Company ──< Control, ProcessArea, SubProcess, Requirement (companyId FK)
Company ──< Assessment, AssessmentTemplate, Attachment (companyId FK)
Standard ──< ProcessArea (standardId)
ProcessArea ──< Requirement (processAreaId)
ProcessArea ──< Control (processAreaId)
Requirement ──< MapControl2Requirement >── Control
User ──< Assessment (assessor)
User ──< UserRoleMapping >── UserRole
User ──< UserFavorite (entityType + entityId)
User ──< AActUsers >── Aact
Assessment ──< ControlAssignment >── Control
Assessment ──< Sample, Finding ──< Action
Control ──< ControlSubProcess >── SubProcess
Control ──< AActControls >── Aact
Control ──< MapControl2Requirement >── Requirement
Attachment ──< AttachmentMapping >── (Action | Finding | Sample)
Knowledgebase ──< MapArt2Know (artifact mapping)
DocumentExtract ──< ControlFromDocument ──< ControlFDSubProcess >── SubProcess
```

---

## 5. Data Integrity Rules

| Rule | Enforcement |
|------|-------------|
| One "Unmapped Controls" per ProcessArea | @@unique([requirementId, processAreaId, companyId]) |
| Control name unique per company | @@unique([name, companyId]) |
| Requirement ID unique per PA per company | @@unique([requirementId, processAreaId, companyId]) |
| Template name unique per company | @@unique([name, companyId]) |
| User cannot favorite same entity twice | @@unique([userId, entityType, entityId]) |
| Control-SubProcess link unique | @@unique([controlId, subProcessId]) |
| Control-Requirement mapping unique | @@unique([controlId, requirementRId]) |
| Assessment-Control assignment unique | @@unique([assessmentId, controlId]) |
| User-Role mapping unique | @@unique([userId, userRoleId]) |
| User-Company mapping unique | @@unique([userId, companyId]) |
| Knowledgebase name unique per company | @@unique([knowledgeName, companyId]) |

---

## 6. Cascade Delete Summary

| Parent | Children | Cascade Type |
|--------|----------|--------------|
| Assessment | ControlAssignment, Sample, Finding, Aact | Prisma onDelete: Cascade |
| Finding | Action | Prisma onDelete: Cascade |
| Aact | AActControls, AActUsers, AActDetails | Prisma onDelete: Cascade |
| Control | ControlSubProcess, ControlFDSubProcess | Prisma onDelete: Cascade |
| User | UserRoleMapping, UserCompany, UserFavorite | Prisma onDelete: Cascade |
| Assessment | AttachmentMapping, Attachment (orphans), MapArt2Know | Manual cleanup in DELETE handler |

---

## 7. Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0.0 | 2026-07-21 | Initial data model documentation. All 45 models, 10 enums, relationships, cascade rules, data integrity constraints. |

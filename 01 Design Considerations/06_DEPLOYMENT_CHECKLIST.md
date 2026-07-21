# SAMS App — Deployment Checklist

**Last Updated:** July 21, 2026  
**Shared DB:** seam-assurance-app (PostgreSQL on Railway)

---

## Pre-Deploy Verification (Local)

- [ ] `npx next build` passes (0 errors, 0 warnings)
- [ ] `npm run dev -p 3100` starts successfully
- [ ] Login as `admin` → redirected to `/admin`, all 4 sub-views load
- [ ] Login as `megan` → redirected to `/fla`, no company selector (single company)
- [ ] Login as `edward` → company selector visible (multi-company admin)
- [ ] Create assessment via `/fla/new` → redirects to detail page
- [ ] Map Controls panel works: click 🗂 → check controls → assign to requirement
- [ ] Database page loads: backup download, export buttons functional
- [ ] `python scripts/verify_parity.py` passes all checks

---

## Railway Setup

### 1. Create Service
In Railway dashboard:
1. New Service → Deploy from GitHub repo
2. Select `isoenthusiast/sams-app`
3. Branch: `main`

### 2. Environment Variables
```
DATABASE_URL="postgresql://postgres:kCTwHlHQEOrrQZGiTMWihARJUavIaFUV@hayabusa.proxy.rlwy.net:54471/railway"
AUTH_SECRET="2oibyfw7i5mb30f5542bw9eixurqvqb7"
NEXTAUTH_URL="https://sams-app.railway.app"
```

### 3. Build Settings
- Builder: RAILPACK (auto-detected)
- Build Command: `npx prisma generate && npm run build`
- Start Command: `npm run start`
- **No preDeployCommand** — DB is shared, no migrations needed

### 4. Verify Deploy
- [ ] Railway build passes
- [ ] Service starts on assigned domain
- [ ] Login with same credentials as seam-app
- [ ] Data matches seam-app for same company
- [ ] Creating assessment in sams-app → visible in seam-app
- [ ] Creating assessment in seam-app → visible in sams-app

---

## Production Cutover Plan

### Phase A: Side-by-Side (Week 1)
- sams-app deployed alongside seam-assurance-app
- Both apps point to same PostgreSQL instance
- Users can use either app — data is shared
- Monitor for: connection pool saturation, query conflicts

### Phase B: Default Migration (Week 2)
- sams-app becomes the default app (port 80/443)
- seam-assurance-app kept as fallback on alternate port
- Company communications: "New SAMS interface available at [url]"
- Old seam URL redirects to sams with notice period

### Phase C: Archival (Week 4+)
- If 0 users access seam-assurance-app for 2 weeks:
  - Stop seam-assurance-app Railway service
  - Keep GitHub repo (read-only archive)
  - Keep DB backup from seam-app for rollback

---

## Rollback Plan

If sams-app has critical issues:
1. Redirect traffic back to seam-assurance-app (update DNS/load balancer)
2. No data rollback needed — both apps share same DB
3. Fix issues in sams-app, redeploy, retest
4. Re-enable traffic

---

## Known Limitations (v0.1.0)

| Limitation | Impact | Mitigation |
|-----------|--------|-----------|
| No tablet optimization | Field assessors use desktop layout | Phase 7 (deferred) |
| No virtualization | 1000+ controls may scroll slowly | Paginate at 100 rows |
| No Knowledgebase upload UI | Admin cannot upload documents via sams | Use seam-app for uploads |
| Export APIs have DISTINCT/BigInt bugs | Controls CSV may error | Fixed in a future PR |
| No Badge generation UI | Admin cannot generate badges via sams | Use seam-app admin |

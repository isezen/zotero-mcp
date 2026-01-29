.PHONY: guard guard-origin guard-identity guard-status guard-commit guard-push guard-check
.PHONY: build clean

# ── Guard configuration ─────────────────────────────────────────────────────
GUARD_ACCOUNT := isezen
GUARD_OWNER   := isezen
GUARD_REPO    := zotero-mcp
GUARD_EMAIL   := 613356+isezen@users.noreply.github.com
GUARD_HOST    := github-isezen
GUARD_ORIGIN  := git@$(GUARD_HOST):$(GUARD_OWNER)/$(GUARD_REPO).git

# ── Guard targets ────────────────────────────────────────────────────────────
guard: guard-check guard-origin guard-identity
	@git-guard install --strict
	@git-guard init-policy --account $(GUARD_ACCOUNT) --owner $(GUARD_OWNER) --repo $(GUARD_REPO) --force
	@git add .git-identity-guard
	@git-guard doctor
	@echo "OK: guard installed, policy created/staged, doctor passed."

guard-origin:
	@echo "Checking origin..."
	@current="$$(git remote get-url origin 2>/dev/null || true)"; \
	if [ -z "$$current" ]; then \
		echo "origin is missing. Adding: $(GUARD_ORIGIN)"; \
		git remote add origin "$(GUARD_ORIGIN)"; \
	elif [ "$$current" != "$(GUARD_ORIGIN)" ]; then \
		echo "origin mismatch."; \
		echo "  current: $$current"; \
		echo "  wanted:  $(GUARD_ORIGIN)"; \
		echo "Fixing origin..."; \
		git remote set-url origin "$(GUARD_ORIGIN)"; \
	else \
		echo "origin OK: $$current"; \
	fi

guard-identity:
	@echo "Checking repo-local git identity..."
	@git config user.name "Ismail SEZEN"
	@current="$$(git config user.email || true)"; \
	if [ "$$current" != "$(GUARD_EMAIL)" ]; then \
		echo "Setting repo-local user.email to $(GUARD_EMAIL)"; \
		git config user.email "$(GUARD_EMAIL)"; \
	else \
		echo "user.email OK: $$current"; \
	fi

guard-status:
	@echo "---- git status ----"
	@git status --porcelain=v1
	@echo "--------------------"

guard-commit:
	@staged="$$(git diff --cached --name-only)"; \
	echo "$$staged" | grep -q "^.git-identity-guard$$" || (echo "Nothing staged for .git-identity-guard. Run: make guard" && exit 1); \
	git commit -m "chore: add git identity guard policy"

guard-push:
	@git push -u origin main

guard-check:
	@command -v git-guard >/dev/null 2>&1 || ( \
		echo "ERROR: git-guard not found in PATH."; \
		echo "Install (private repo):"; \
		echo "  pipx install \"git+ssh://git@github-isezen/isezen/git-identity-guard.git\""; \
		echo "Or update:"; \
		echo "  pipx install --force \"git+ssh://git@github-isezen/isezen/git-identity-guard.git\""; \
		exit 1 \
	)

# ── Build targets ────────────────────────────────────────────────────────────
build:
	npm run build

clean:
	rm -rf dist

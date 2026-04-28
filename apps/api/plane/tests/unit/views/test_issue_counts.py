# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.app.views.issue.base import annotate_issue_cycle_and_counts
from plane.db.models import FileAsset, Issue, IssueLink, Project, ProjectMember, State


@pytest.fixture
def project(db, workspace, create_user):
    project = Project.objects.create(
        name="Test Project",
        identifier="TP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(
        project=project,
        member=create_user,
        role=20,
        is_active=True,
    )
    return project


@pytest.fixture
def state(project):
    return State.objects.create(
        name="Todo",
        project=project,
        group="backlog",
        default=True,
    )


@pytest.fixture
def issue_with_relations(workspace, project, state, create_user):
    issue = Issue.objects.create(
        name="Parent issue",
        workspace=workspace,
        project=project,
        state=state,
        created_by=create_user,
        updated_by=create_user,
    )
    Issue.objects.create(
        name="Child issue",
        workspace=workspace,
        project=project,
        state=state,
        parent=issue,
        created_by=create_user,
        updated_by=create_user,
    )
    IssueLink.objects.create(
        issue=issue,
        workspace=workspace,
        project=project,
        title="Reference",
        url="https://plane.so",
        created_by=create_user,
        updated_by=create_user,
    )
    FileAsset.objects.create(
        issue=issue,
        workspace=workspace,
        project=project,
        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
        asset="attachment.txt",
        size=10,
        is_uploaded=True,
        created_by=create_user,
        updated_by=create_user,
    )
    return issue


@pytest.fixture
def issue_without_relations(workspace, project, state, create_user):
    return Issue.objects.create(
        name="Standalone issue",
        workspace=workspace,
        project=project,
        state=state,
        created_by=create_user,
        updated_by=create_user,
    )


@pytest.mark.unit
class TestIssueCountAnnotations:
    @pytest.mark.django_db
    def test_annotate_issue_cycle_and_counts_returns_expected_counts(self, issue_with_relations):
        issue = annotate_issue_cycle_and_counts(Issue.objects.filter(pk=issue_with_relations.pk)).get()

        assert issue.link_count == 1
        assert issue.attachment_count == 1
        assert issue.sub_issues_count == 1

    @pytest.mark.django_db
    def test_annotate_issue_cycle_and_counts_returns_zeroes_without_relations(self, issue_without_relations):
        issue = annotate_issue_cycle_and_counts(Issue.objects.filter(pk=issue_without_relations.pk)).get()

        assert issue.link_count == 0
        assert issue.attachment_count == 0
        assert issue.sub_issues_count == 0

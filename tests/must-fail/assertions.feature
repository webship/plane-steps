@must-fail
Feature: Assertions that must fail
  Each scenario asserts something that is not true on the test site: its last step must fail with the message its
  description announces, and a hint. The scenarios only read; tests/check-must-fail.js runs them.

  Scenario: A session that is not the account named
    Fails with: Expected the session to be "owner", but it is member (member@example.com).
    Given I am a logged in user with the "member" user
    Then I should be logged in as "owner"

  Scenario: A login that worked is not refused
    Fails with: Expected the login to be refused with "Authentication failed", but
    Given I am not logged in
    When I log in with the "member" user
    Then the login should be refused with "Authentication failed"

  Scenario: A work item the list does not show
    Fails with: Expected to see the work item "Webship test nothing" in the list
    Given I am a logged in user with the "member" user
    When I open the project "WEB"
    Then the work item list should show "Webship test nothing"

  Scenario: A state the work item is not in
    Fails with: Expected the state of the work item to be "Done", but it is "In Progress".
    Given I am a logged in user with the "member" user
    When I open the work item "WEB-1"
    Then the state of the work item should be "Done"

  Scenario: A comment the work item does not have
    Fails with: Expected the work item to show the comment "Webship test nothing", but it does not.
    Given I am a logged in user with the "member" user
    When I open the work item "WEB-1"
    Then the work item should show the comment "Webship test nothing"

  Scenario: A comment by another account
    Fails with: The work item shows the comment "The script is in the project's repository", but by owner, not member.
    Given I am a logged in user with the "member" user
    When I open the work item "WEB-1"
    Then the work item should show the comment "The script is in the project's repository" by "member"

  Scenario: An assignee the work item does not have
    Fails with: Expected the work item to be assigned to "owner", but it is assigned to member.
    Given I am a logged in user with the "member" user
    When I open the work item "WEB-1"
    Then the work item should be assigned to "owner"

  Scenario: Another last editor
    Fails with: Expected the work item to be last edited by "member", but it says "Last edited by owner
    Given I am a logged in user with the "member" user
    When I open the work item "WEB-1"
    Then the work item should be last edited by "member"

  Scenario: A member who may move a work item
    Fails with: Expected the state of the work item to be closed to this account, but its control is open.
    Given I am a logged in user with the "member" user
    When I open the work item "WEB-1"
    Then I should not be able to change the state of the work item

  Scenario: A member who may make a work item
    Fails with: Expected no open button for a new work item, but
    Given I am a logged in user with the "member" user
    Then I should not be able to create a work item in the project "WEB"

  Scenario: A project a member may open
    Fails with: Expected the project Webship site to be refused, but the site shows no refusal
    Given I am a logged in user with the "member" user
    Then I should be refused the project "WEB"

  Scenario: A work item a member may open
    Fails with: Expected the work item WEB-1 to be refused, but the site shows no refusal
    Given I am a logged in user with the "member" user
    Then I should be refused the work item "WEB-1"

  Scenario: A work item the cycle does not hold
    Fails with: Expected to see the work item "The usage line spells greeting as greting" in the cycle Sprint 1
    Given I am a logged in user with the "member" user
    When I open the cycle "Sprint 1" of the project "WEB"
    Then the cycle should list the work item "The usage line spells greeting as greting"

  Scenario: A cycle the project does not have
    Fails with: Expected to see the cycle "Sprint 9", but it did not appear
    Given I am a logged in user with the "member" user
    When I open the cycles of the project "WEB"
    Then the cycles should list "Sprint 9"

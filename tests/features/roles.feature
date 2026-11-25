@roles
Feature: What a Guest of the project may do
  A Guest sees only the work items it created, is refused the others, and neither moves its own nor makes one; an
  Admin and a Member see them all.

  Scenario: A Guest sees only the work items it created
    Given I am a logged in user with the "reader" user
    When I open the project "WEB"
    Then the work item list should show "An issue opened by someone outside the project"
    And the work item list should not show "The greeting script says Helo instead of Hello"

  @js-off
  Scenario: A Guest is refused a work item it did not create
    Given I am a logged in user with the "reader" user
    Then I should be refused the work item "WEB-1"

  Scenario: A Guest neither moves its own work item nor makes one
    Given I am a logged in user with the "reader" user
    When I open the work item "WEB-3"
    Then I should not be able to change the state of the work item
    And I should not be able to create a work item in the project "WEB"

@cycles
Feature: The cycles of a project
  The current cycle holds the work items added to it, and the cycles page lists the project's cycles.

  Scenario: The current cycle and its work items
    Given I am a logged in user with the "member" user
    When I open the cycle "Sprint 1" of the project "WEB"
    Then the cycle should list the work item "The greeting script says Helo instead of Hello"
    And the cycle should not list the work item "The usage line spells greeting as greting"

  Scenario: The cycles page lists the project's cycles
    Given I am a logged in user with the "member" user
    When I open the cycles of the project "WEB"
    Then the cycles should list "Sprint 1"
    And the cycles should not list "Sprint 9"

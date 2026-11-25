@session
Feature: Logging in and out
  An account logs in with its e-mail address and its password, in two steps, and out again from its account menu; a
  wrong password is refused, and an account with no membership of the workspace is refused its projects.

  Scenario: An account logs in through the form and out again
    Given I am not logged in
    When I log in with the "member" user
    Then I should be logged in as "member"
    When I log out
    Then I should not be logged in

  @js-off
  Scenario: A wrong password is refused
    When I log in as "member@example.com" with the password "not-the-right-password"
    Then the login should be refused with "Authentication failed"
    And I should not be logged in

  Scenario: The session of an account, by its whole name and its address
    Given I am a logged in user with the "owner" user
    Then I should be logged in as "Owner Test"
    And I should be logged in as "owner@example.com"

  @js-off
  Scenario: An account with no membership is refused the project, and logs out
    Given I am a logged in user with the "stranger" user
    Then I should be refused the project "WEB"
    When I log out
    Then I should not be logged in
